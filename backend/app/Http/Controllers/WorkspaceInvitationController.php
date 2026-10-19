<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\WorkspaceInvitations;
use App\Http\Requests\CreateWorkspaceInvitationRequest;
use App\Http\Requests\WorkspaceInvitationRequest;
use App\Http\Resources\WorkspaceInvitationPreviewResource;
use App\Http\Resources\WorkspaceInvitationResource;
use App\Http\Resources\WorkspaceResource;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceInvitation;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Header;
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response as ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class WorkspaceInvitationController
{
    #[Endpoint(operationId: 'listWorkspaceInvitations', title: 'List outstanding workspace invitations', description: 'Owner-only, 25 per page, ordered by email then ID. Includes expired invitations so they can be resent; excludes accepted and revoked invitations.')]
    #[QueryParameter('page', type: 'int', default: 1)]
    #[ApiResponse(403, type: 'array{message: string}')]
    #[ApiResponse(404, type: 'array{message: string}')]
    public function index(string $workspace): AnonymousResourceCollection
    {
        $workspace = Workspace::query()->find($workspace) ?? abort(404, 'Not Found.');
        Gate::authorize('manageInvitations', $workspace);

        return WorkspaceInvitationResource::collection(WorkspaceInvitation::query()->where('workspace_id', $workspace->id)
            ->whereNull('accepted_at')->whereNull('revoked_at')->orderBy('email')->orderBy('id')->paginate(25));
    }

    #[Endpoint(operationId: 'createWorkspaceInvitation', title: 'Invite a workspace member', description: 'Owner-only. Queues an encrypted email with a seven-day link. Does not grant membership. A queue failure preserves the invitation for resend. Bind account_id to the account shown by the form.')]
    #[ApiResponse(403, type: 'array{message: string}')]
    #[ApiResponse(404, type: 'array{message: string}')]
    #[ApiResponse(409, type: 'array{message: string, code: "account_context_changed"}')]
    #[ApiResponse(503, type: 'array{message: string, code: "invitation_queue_unavailable"}')]
    #[Header('Retry-After', type: 'int', required: true, status: 201)]
    public function store(CreateWorkspaceInvitationRequest $request, string $workspace, WorkspaceInvitations $invitations): JsonResponse
    {
        return (new WorkspaceInvitationResource($invitations->create($this->user($request), $workspace, $request->string('email')->toString())))
            ->response()->setStatusCode(201)->header('Cache-Control', 'no-store, private')
            ->header('Retry-After', (string) WorkspaceInvitations::RESEND_SECONDS);
    }

    #[Endpoint(operationId: 'resendWorkspaceInvitation', title: 'Resend a workspace invitation', description: 'Owner-only. Rotates the token and renews the seven-day expiry. Shares a 60-second cooldown with creation, plus per-account request limits. Queue failures are immediately retryable.')]
    #[ApiResponse(403, type: 'array{message: string}')]
    #[ApiResponse(404, type: 'array{message: string}')]
    #[ApiResponse(409, type: 'array{message: string, code: "account_context_changed"}')]
    #[ApiResponse(410, type: 'array{message: string}')]
    #[ApiResponse(503, type: 'array{message: string, code: "invitation_queue_unavailable"}')]
    #[Header('Retry-After', type: 'int', required: true, status: 200)]
    public function resend(WorkspaceInvitationRequest $request, string $workspace, string $invitation, WorkspaceInvitations $invitations): JsonResponse
    {
        return (new WorkspaceInvitationResource($invitations->resend($this->user($request), $workspace, $invitation)))
            ->response()->header('Cache-Control', 'no-store, private')
            ->header('Retry-After', (string) WorkspaceInvitations::RESEND_SECONDS);
    }

    #[Endpoint(operationId: 'revokeWorkspaceInvitation', title: 'Revoke a workspace invitation', description: 'Owner-only. Repeated revocation succeeds; accepted invitations return 410. Revoking never removes an existing membership.')]
    #[ApiResponse(403, type: 'array{message: string}')]
    #[ApiResponse(404, type: 'array{message: string}')]
    #[ApiResponse(409, type: 'array{message: string, code: "account_context_changed"}')]
    #[ApiResponse(410, type: 'array{message: string}')]
    public function destroy(WorkspaceInvitationRequest $request, string $workspace, string $invitation, WorkspaceInvitations $invitations): Response
    {
        $invitations->revoke($this->user($request), $workspace, $invitation);

        return response()->noContent();
    }

    #[Endpoint(operationId: 'getWorkspaceInvitation', title: 'Preview an invitation', description: 'Requires the verified invited email. Does not create a membership or consume the token. Invalid, rotated, revoked and expired tokens return 410.')]
    #[ApiResponse(403, type: 'array{message: string, code: "invitation_account_mismatch"}')]
    #[ApiResponse(410, type: 'array{message: string}')]
    public function show(Request $request, string $token, WorkspaceInvitations $invitations): WorkspaceInvitationPreviewResource
    {
        return new WorkspaceInvitationPreviewResource($invitations->preview($this->user($request), $token));
    }

    #[Endpoint(operationId: 'acceptWorkspaceInvitation', title: 'Accept a workspace invitation', description: 'Requires the verified invited email and explicit confirmation. Creates a member membership atomically; safe to repeat while membership remains. Never restores membership removed after acceptance. Bind account_id to the account shown by the form.')]
    #[ApiResponse(403, type: 'array{message: string, code: "invitation_account_mismatch"}')]
    #[ApiResponse(409, type: 'array{message: string, code: "account_context_changed"}')]
    #[ApiResponse(410, type: 'array{message: string}')]
    public function accept(WorkspaceInvitationRequest $request, string $token, WorkspaceInvitations $invitations): WorkspaceResource
    {
        return new WorkspaceResource($invitations->accept($this->user($request), $token));
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
