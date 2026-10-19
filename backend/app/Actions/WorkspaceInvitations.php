<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\WorkspaceRole;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceInvitation;
use App\Notifications\WorkspaceInvitationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use LogicException;
use Throwable;

class WorkspaceInvitations
{
    public const int RESEND_SECONDS = 60;

    public function create(User $actor, string $workspaceId, string $email): WorkspaceInvitation
    {
        $token = bin2hex(random_bytes(32));
        $invitation = DB::transaction(function () use ($actor, $workspaceId, $email, $token): WorkspaceInvitation {
            $workspace = $this->ownedWorkspace($actor, $workspaceId);
            $this->ensureNotMember($workspace, $email);
            $invitation = WorkspaceInvitation::query()->firstOrNew(['workspace_id' => $workspace->id, 'email' => $email]);
            if ($invitation->exists && $invitation->isPending()) {
                throw ValidationException::withMessages(['email' => 'An invitation is already pending for this email. Resend it instead.']);
            }

            return $this->rotate($invitation, $actor, $token);
        });

        $this->deliver($invitation, $token);

        return $invitation;
    }

    public function resend(User $actor, string $workspaceId, string $id): WorkspaceInvitation
    {
        $token = bin2hex(random_bytes(32));
        $invitation = DB::transaction(function () use ($actor, $workspaceId, $id, $token): WorkspaceInvitation {
            $workspace = $this->ownedWorkspace($actor, $workspaceId);
            $invitation = WorkspaceInvitation::query()->where('workspace_id', $workspace->id)->find($id) ?? abort(404, 'Not Found.');
            abort_if($invitation->accepted_at !== null || $invitation->revoked_at !== null, 410, 'This invitation is no longer available.');
            $this->ensureNotMember($workspace, $invitation->email);

            return $this->rotate($invitation, $actor, $token);
        });

        $this->deliver($invitation, $token);

        return $invitation;
    }

    public function revoke(User $actor, string $workspaceId, string $id): void
    {
        DB::transaction(function () use ($actor, $workspaceId, $id): void {
            $workspace = $this->ownedWorkspace($actor, $workspaceId);
            $invitation = WorkspaceInvitation::query()->where('workspace_id', $workspace->id)->find($id) ?? abort(404, 'Not Found.');
            abort_if($invitation->accepted_at !== null, 410, 'This invitation has already been accepted.');
            if ($invitation->revoked_at === null) {
                $invitation->update(['revoked_at' => now()]);
            }
        });
    }

    public function preview(User $user, string $token): WorkspaceInvitation
    {
        $invitation = $this->byToken($token);
        $this->ensureRecipient($invitation, $user);

        $workspace = Workspace::query()->find($invitation->workspace_id)
            ?? abort(410, 'This invitation is no longer available.');

        return $invitation->setRelation('workspace', $workspace);
    }

    public function accept(User $account, string $token): Workspace
    {
        return DB::transaction(function () use ($account, $token): Workspace {
            $candidate = $this->byToken($token);
            // All invitation mutations lock the workspace first, serializing creation, rotation and acceptance.
            $workspace = Workspace::query()->lockForUpdate()->find($candidate->workspace_id)
                ?? abort(410, 'This invitation is no longer available.');
            $invitation = $this->byToken($token);
            $user = User::query()->lockForUpdate()->findOrFail($account->id);
            $this->ensureRecipient($invitation, $user);
            $memberWorkspace = $user->workspaces()->find($workspace->id);
            if ($memberWorkspace === null) {
                $workspace->users()->attach($user, ['role' => WorkspaceRole::Member]);
                $memberWorkspace = $user->workspaces()->find($workspace->id)
                    ?? throw new LogicException('Invitation acceptance requires a member membership.');
            }
            if ($invitation->accepted_at === null) {
                $invitation->update(['accepted_at' => now()]);
            }

            return $memberWorkspace;
        });
    }

    private function ownedWorkspace(User $actor, string $id): Workspace
    {
        $workspace = Workspace::query()->lockForUpdate()->find($id) ?? abort(404, 'Not Found.');
        Gate::forUser($actor)->authorize('manageInvitations', $workspace);

        return $workspace;
    }

    private function ensureNotMember(Workspace $workspace, string $email): void
    {
        if ($workspace->users()->where('users.email', $email)->exists()) {
            throw ValidationException::withMessages(['email' => 'This email already belongs to a workspace member.']);
        }
    }

    private function rotate(WorkspaceInvitation $invitation, User $actor, string $token): WorkspaceInvitation
    {
        $retry = $invitation->last_queued_at?->addSeconds(self::RESEND_SECONDS)->getTimestamp() ?? 0;
        if ($retry > now()->getTimestamp()) {
            abort(response()->json(['message' => 'Please wait before sending another invitation.'], 429)
                ->header('Retry-After', (string) ($retry - now()->getTimestamp())));
        }
        $invitation->fill([
            'invited_by' => $actor->id,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(7),
            'last_queued_at' => now(),
            'accepted_at' => null,
            'revoked_at' => null,
        ])->save();

        return $invitation;
    }

    private function deliver(WorkspaceInvitation $invitation, string $token): void
    {
        try {
            Notification::route('mail', $invitation->email)
                ->notify(new WorkspaceInvitationNotification($invitation->id, $token));
        } catch (Throwable $exception) {
            report($exception);
            // Keep the invitation manageable and immediately retryable without clearing a newer reservation.
            WorkspaceInvitation::query()->whereKey($invitation->id)->where('token_hash', $invitation->token_hash)
                ->update(['last_queued_at' => null]);
            abort(response()->json([
                'message' => 'The invitation was saved, but its email could not be queued. Please resend it.',
                'code' => 'invitation_queue_unavailable',
            ], 503)->header('Retry-After', '1'));
        }
    }

    private function byToken(string $token): WorkspaceInvitation
    {
        $invitation = WorkspaceInvitation::query()->where('token_hash', hash('sha256', $token))->first();
        abort_if($invitation === null || $invitation->revoked_at !== null || ! $invitation->expires_at->isFuture(), 410, 'This invitation is no longer available.');

        return $invitation;
    }

    private function ensureRecipient(WorkspaceInvitation $invitation, User $user): void
    {
        if (! $user->hasVerifiedEmail()) {
            abort(response()->json(['message' => 'Verify your email before accepting an invitation.', 'code' => 'email_unverified'], 403));
        }
        if (! hash_equals($invitation->email, $user->email)) {
            abort(response()->json(['message' => 'Sign in with the email address that received this invitation.', 'code' => 'invitation_account_mismatch'], 403));
        }
        // Consumed links can confirm success, but must never restore a subsequently removed membership.
        abort_if($invitation->accepted_at !== null && ! $user->workspaces()->whereKey($invitation->workspace_id)->exists(), 410, 'This invitation is no longer available.');
    }
}
