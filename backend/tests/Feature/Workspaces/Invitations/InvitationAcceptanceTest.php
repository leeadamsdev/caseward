<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces\Invitations;

use App\Enums\WorkspaceRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\WorkspaceInvitationFixture;
use Tests\TestCase;

class InvitationAcceptanceTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_preview_is_read_only_and_explicit_acceptance_creates_only_a_member_membership(): void
    {
        $owner = $this->user();
        $recipient = $this->user();
        $workspace = $this->workspace($owner);
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, $recipient->email);
        $this->signIn($recipient);
        $path = "/api/invitations/{$token}";
        $this->browserRequest('GET', $path)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.workspace', ['id' => $workspace->id, 'name' => $workspace->name])
            ->assertJsonPath('data.accepted', false)->assertJsonPath('data.email', $recipient->email)->assertDontSee($owner->email);
        $this->assertDatabaseCount('workspace_memberships', 1);
        $this->assertNull($invitation->refresh()->accepted_at);
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}")->assertNotFound();
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id, 'role' => 'owner'])
            ->assertOk()->assertExactJson(['data' => ['id' => $workspace->id, 'name' => $workspace->name, 'role' => 'member']]);
        $this->assertNotNull($invitation->refresh()->accepted_at);
        $this->assertDatabaseCount('workspace_memberships', 2);
        $this->browserRequest('GET', '/api/workspaces')->assertOk()->assertJsonPath('data.0.id', $workspace->id);
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/members")->assertOk()->assertJsonCount(2, 'data');
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/invitations")->assertForbidden();
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id])->assertOk();
        $this->browserRequest('GET', $path)->assertOk()->assertJsonPath('data.accepted', true);
        $this->assertDatabaseCount('workspace_memberships', 2);
        $workspace->users()->detach($recipient);
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id])->assertGone();
        $this->browserRequest('GET', $path)->assertGone();
        $this->assertDatabaseCount('workspace_memberships', 1);
    }

    public function test_guest_unverified_wrong_account_and_stale_account_context_cannot_accept(): void
    {
        $owner = $this->user();
        $recipient = $this->user(verified: false);
        $workspace = $this->workspace($owner);
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, $recipient->email);
        $path = "/api/invitations/{$token}";
        $this->browserRequest('GET', $path)->assertUnauthorized();
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id])->assertUnauthorized();
        $this->signIn($recipient);
        $this->browserRequest('GET', $path)->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->browserRequest('GET', '/api/invitations/'.str_repeat('f', 64))->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id])->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->signIn($owner);
        $this->browserRequest('GET', $path)->assertForbidden()->assertJsonPath('code', 'invitation_account_mismatch')->assertDontSee($workspace->name)->assertDontSee($recipient->email);
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $owner->id])->assertForbidden()->assertJsonPath('code', 'invitation_account_mismatch');
        $recipient->markEmailAsVerified();
        $this->signIn($recipient);
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $owner->id])->assertConflict()->assertJsonPath('code', 'account_context_changed');
        $this->browserRequest('POST', "{$path}/accept", ['account_id' => $recipient->id], csrf: false)->assertStatus(419);
        $this->assertDatabaseCount('workspace_memberships', 1);
        $this->assertNull($invitation->refresh()->accepted_at);
    }

    public function test_expired_revoked_rotated_and_deleted_workspace_tokens_cannot_be_used(): void
    {
        $this->freezeTime();
        $owner = $this->user();
        $recipient = $this->user();
        $workspace = $this->workspace($owner);
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, $recipient->email);
        $this->signIn($recipient);
        $path = "/api/invitations/{$token}";
        $payload = ['account_id' => $recipient->id];
        $original = $invitation->getAttributes();
        foreach ([['expires_at' => now()], ['revoked_at' => now()], ['token_hash' => str_repeat('a', 64)]] as $change) {
            $invitation->forceFill($original)->fill($change)->save();
            $this->browserRequest('GET', $path)->assertGone();
            $this->browserRequest('POST', "{$path}/accept", $payload)->assertGone();
        }
        $invitation->forceFill($original)->save();
        $workspace->delete();
        $this->browserRequest('POST', "{$path}/accept", $payload)->assertGone();
        $this->assertDatabaseCount('workspace_invitations', 0);
        $this->browserRequest('GET', '/api/invitations/'.str_repeat('f', 64))->assertGone();
        $this->browserRequest('GET', '/api/invitations/not-a-token')->assertNotFound();
    }

    public function test_accepting_when_already_a_member_preserves_the_existing_role(): void
    {
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        [, $token] = WorkspaceInvitationFixture::create($workspace, $owner, $owner->email);
        $this->signIn($owner);
        $this->browserRequest('POST', "/api/invitations/{$token}/accept", ['account_id' => $owner->id])->assertOk()->assertJsonPath('data.role', WorkspaceRole::Owner->value);
        $this->assertDatabaseCount('workspace_memberships', 1);
    }
}
