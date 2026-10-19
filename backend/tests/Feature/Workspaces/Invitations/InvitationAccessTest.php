<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces\Invitations;

use App\Notifications\WorkspaceInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\WorkspaceInvitationFixture;
use Tests\TestCase;

class InvitationAccessTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    #[DataProvider('endpoints')]
    public function test_every_endpoint_requires_authentication_and_verification_before_resource_lookup(string $method, string $path): void
    {
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest($method, $path)->assertUnauthorized();
        $this->signIn($this->user(verified: false));
        $this->browserRequest($method, $path)->assertForbidden()->assertJsonPath('code', 'email_unverified');
    }

    /** @return iterable<string, array{string, string}> */
    public static function endpoints(): iterable
    {
        $base = '/api/workspaces/01ARZ3NDEKTSV4RRFFQ69G5FAV/invitations';
        yield 'listing' => ['GET', $base];
        yield 'creation' => ['POST', $base];
        yield 'resend' => ['POST', "{$base}/01ARZ3NDEKTSV4RRFFQ69G5FAV/resend"];
        yield 'revocation' => ['DELETE', "{$base}/01ARZ3NDEKTSV4RRFFQ69G5FAV"];
        yield 'preview' => ['GET', '/api/invitations/'.str_repeat('a', 64)];
        yield 'acceptance' => ['POST', '/api/invitations/'.str_repeat('a', 64).'/accept'];
    }

    public function test_owner_mutations_require_csrf_and_the_account_shown_by_the_form(): void
    {
        Notification::fake();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        [$invitation] = WorkspaceInvitationFixture::create($workspace, $owner, 'new@example.com');
        $this->signIn($owner);
        $base = "/api/workspaces/{$workspace->id}/invitations";
        foreach ([['POST', $base], ['POST', "{$base}/{$invitation->id}/resend"], ['DELETE', "{$base}/{$invitation->id}"]] as [$method, $path]) {
            $this->browserRequest($method, $path, ['account_id' => $owner->id, 'email' => 'new@example.com'], csrf: false)->assertStatus(419);
            $this->browserRequest($method, $path, ['account_id' => $owner->id + 1, 'email' => 'new@example.com'])->assertConflict()->assertJsonPath('code', 'account_context_changed');
        }
        Notification::assertNothingSent();
        $this->assertNull($invitation->refresh()->revoked_at);
    }

    public function test_invitation_requests_share_account_limits_across_workspaces(): void
    {
        Notification::fake();
        $owner = $this->user();
        $first = $this->workspace($owner);
        $second = $this->workspace($owner);
        $this->signIn($owner);
        for ($i = 0; $i < 10; $i++) {
            $workspace = $i % 2 === 0 ? $first : $second;
            $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", ['account_id' => $owner->id, 'email' => "colleague{$i}@example.com"])->assertCreated();
        }
        $this->browserRequest('POST', "/api/workspaces/{$second->id}/invitations", ['account_id' => $owner->id, 'email' => 'blocked@example.com'])->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertDatabaseCount('workspace_invitations', 10);
    }

    public function test_different_owners_share_the_recipient_cooldown(): void
    {
        Notification::fake();
        $owner = $this->user();
        $otherOwner = $this->user();
        $workspace = $this->workspace($owner);
        $workspace->users()->attach($otherOwner, ['role' => 'owner']);
        [$invitation] = WorkspaceInvitationFixture::create($workspace, $owner, 'new@example.com');
        $this->signIn($owner);
        $path = "/api/workspaces/{$workspace->id}/invitations/{$invitation->id}/resend";
        $this->browserRequest('POST', $path, ['account_id' => $owner->id])->assertOk();
        $this->signIn($otherOwner);
        $this->browserRequest('POST', $path, ['account_id' => $otherOwner->id])->assertTooManyRequests();
        Notification::assertSentOnDemandTimes(WorkspaceInvitationNotification::class, 1);
    }
}
