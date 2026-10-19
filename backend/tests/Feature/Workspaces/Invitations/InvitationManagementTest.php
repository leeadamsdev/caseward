<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces\Invitations;

use App\Enums\WorkspaceRole;
use App\Models\WorkspaceInvitation;
use App\Notifications\WorkspaceInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use RedisException;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\WorkspaceInvitationFixture;
use Tests\TestCase;

class InvitationManagementTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_owner_can_invite_a_new_email_without_creating_an_account_or_membership(): void
    {
        $this->freezeTime();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", [
            'account_id' => $owner->id, 'email' => ' New.Colleague@EXAMPLE.com ', 'role' => 'owner',
        ])->assertCreated()->assertJsonPath('data.email', 'new.colleague@example.com')
            ->assertJsonPath('data.expires_at', now()->addDays(7)->toIso8601String())
            ->assertHeader('Retry-After', '60')->assertHeader('Cache-Control', 'no-store, private')
            ->assertDontSee('token')->assertDontSee('invited_by');
        $invitation = WorkspaceInvitation::query()->sole();
        $this->assertSame($owner->id, $invitation->invited_by);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('workspace_memberships', 1);
        Notification::assertSentOnDemand(WorkspaceInvitationNotification::class,
            fn (WorkspaceInvitationNotification $notification, array $channels, AnonymousNotifiable $notifiable): bool => $channels === ['mail'] && $notifiable->routes['mail'] === $invitation->email
                && hash('sha256', basename($notification->toMail($notifiable)->actionUrl)) === $invitation->token_hash);
    }

    public function test_owner_listing_is_scoped_bounded_and_includes_expired_but_not_terminal_invitations(): void
    {
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        for ($i = 0; $i < 27; $i++) {
            WorkspaceInvitationFixture::create($workspace, $owner, sprintf('colleague%02d@example.com', $i));
        }
        [$expired] = WorkspaceInvitationFixture::create($workspace, $owner, 'expired@example.com');
        $expired->update(['expires_at' => now()->subSecond()]);
        [$accepted] = WorkspaceInvitationFixture::create($workspace, $owner, 'accepted@example.com');
        $accepted->update(['accepted_at' => now()]);
        [$revoked] = WorkspaceInvitationFixture::create($workspace, $owner, 'revoked@example.com');
        $revoked->update(['revoked_at' => now()]);
        WorkspaceInvitationFixture::create($this->workspace($owner), $owner, 'private@example.com');
        $this->signIn($owner);
        $path = "/api/workspaces/{$workspace->id}/invitations";
        $this->browserRequest('GET', "{$path}?per_page=1000")->assertOk()->assertJsonCount(25, 'data')
            ->assertJsonPath('meta.total', 28)->assertJsonPath('meta.per_page', 25)
            ->assertJsonPath('data.0.email', 'colleague00@example.com')->assertDontSee('token');
        $this->browserRequest('GET', "{$path}?page=2")->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.2.id', $expired->id);
        $this->browserRequest('GET', "{$path}?page=99")->assertOk()->assertJsonPath('data', []);
    }

    public function test_validation_duplicate_invites_and_existing_members_do_not_queue_mail(): void
    {
        $owner = $this->user();
        $member = $this->user();
        $workspace = $this->workspace($owner);
        $workspace->users()->attach($member, ['role' => WorkspaceRole::Member]);
        WorkspaceInvitationFixture::create($workspace, $owner, 'pending@example.com');
        $this->signIn($owner);
        $path = "/api/workspaces/{$workspace->id}/invitations";
        foreach (['invalid', $owner->email, $member->email, 'PENDING@example.com', str_repeat('x', 255).'@example.com'] as $email) {
            $this->browserRequest('POST', $path, ['account_id' => $owner->id, 'email' => $email])->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        $this->browserRequest('POST', $path, ['email' => 'new@example.com'])->assertUnprocessable()->assertJsonValidationErrors('account_id');
        $this->browserRequest('POST', $path, ['account_id' => $member->id, 'email' => 'new@example.com'])->assertConflict()->assertJsonPath('code', 'account_context_changed');
        Notification::assertNothingSent();
        $this->assertDatabaseCount('workspace_invitations', 1);
    }

    public function test_resend_rotates_and_renews_the_link_while_revoke_invalidates_it_and_reinvite_reuses_the_record(): void
    {
        $this->freezeTime();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, 'new@example.com');
        $invitation->update(['expires_at' => now()->subDay()]);
        $this->signIn($owner);
        $path = "/api/workspaces/{$workspace->id}/invitations/{$invitation->id}";
        $payload = ['account_id' => $owner->id];
        $this->browserRequest('POST', "{$path}/resend", $payload)->assertOk()->assertHeader('Retry-After', '60')
            ->assertJsonPath('data.expires_at', now()->addDays(7)->toIso8601String());
        $this->assertNotSame(hash('sha256', $token), $invitation->refresh()->token_hash);
        $this->browserRequest('GET', "/api/invitations/{$token}")->assertGone();
        $this->browserRequest('POST', "{$path}/resend", $payload)->assertTooManyRequests()->assertHeader('Retry-After', '60');
        $this->travel(60)->seconds();
        $this->browserRequest('POST', "{$path}/resend", $payload)->assertOk();
        $this->browserRequest('DELETE', $path, $payload)->assertNoContent();
        $this->browserRequest('DELETE', $path, $payload)->assertNoContent();
        $this->browserRequest('POST', "{$path}/resend", $payload)->assertGone();
        $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", [...$payload, 'email' => $invitation->email])->assertTooManyRequests();
        $this->travel(60)->seconds();
        $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", [...$payload, 'email' => $invitation->email])->assertCreated()->assertJsonPath('data.id', $invitation->id);
        $this->assertDatabaseCount('workspace_invitations', 1);
    }

    public function test_permissions_are_owner_only_scoped_and_rechecked_on_each_request(): void
    {
        Config::set('app.debug', false);
        $owner = $this->user();
        $member = $this->user();
        $outsider = $this->user();
        $workspace = $this->workspace($owner);
        $workspace->users()->attach($member, ['role' => WorkspaceRole::Member]);
        [$invitation] = WorkspaceInvitationFixture::create($workspace, $owner, 'new@example.com');
        [$foreign] = WorkspaceInvitationFixture::create($this->workspace($owner), $owner, 'private@example.com');
        $path = "/api/workspaces/{$workspace->id}/invitations";
        $this->signIn($member);
        foreach (['GET' => $path, 'POST' => $path, 'DELETE' => "{$path}/{$invitation->id}"] as $method => $uri) {
            $this->browserRequest($method, $uri, ['account_id' => $member->id, 'email' => 'new@example.com'])->assertForbidden();
        }
        $this->browserRequest('POST', "{$path}/{$invitation->id}/resend", ['account_id' => $member->id])->assertForbidden();
        $this->signIn($outsider);
        $this->browserRequest('GET', $path)->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
        $unknown = Str::ulid()->toBase32();
        $this->browserRequest('GET', "/api/workspaces/{$unknown}/invitations")->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
        $this->browserRequest('POST', $path, ['account_id' => $outsider->id, 'email' => 'new@example.com'])->assertNotFound();
        $this->signIn($owner);
        $this->browserRequest('POST', "{$path}/{$foreign->id}/resend", ['account_id' => $owner->id])->assertNotFound();
        $this->browserRequest('DELETE', "{$path}/{$foreign->id}", ['account_id' => $owner->id])->assertNotFound();
        $workspace->users()->updateExistingPivot($owner, ['role' => WorkspaceRole::Member]);
        $this->browserRequest('POST', "{$path}/{$invitation->id}/resend", ['account_id' => $owner->id])->assertForbidden();
        Notification::assertNothingSent();
    }

    public function test_queue_failure_preserves_a_retryable_invitation_without_claiming_delivery(): void
    {
        Exceptions::fake();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        Notification::shouldReceive('send')->once()->andThrow(new RedisException('Queue unavailable.'));
        $path = "/api/workspaces/{$workspace->id}/invitations";
        $this->browserRequest('POST', $path, ['account_id' => $owner->id, 'email' => 'new@example.com'])
            ->assertServiceUnavailable()->assertJsonPath('code', 'invitation_queue_unavailable');
        $invitation = WorkspaceInvitation::query()->sole();
        $this->assertNull($invitation->last_queued_at);
        $this->assertDatabaseCount('workspace_memberships', 1);
        Notification::fake();
        $this->browserRequest('POST', "{$path}/{$invitation->id}/resend", ['account_id' => $owner->id])->assertOk();
        Notification::assertSentOnDemand(WorkspaceInvitationNotification::class);
    }
}
