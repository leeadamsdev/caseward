<?php

declare(strict_types=1);

namespace Tests\Feature\Contracts;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use RedisException;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\WorkspaceInvitationFixture;
use Tests\Support\ApiContract;
use Tests\TestCase;

class WorkspaceInvitationResponsesTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_invitation_management_responses_match_the_contract(): void
    {
        Notification::fake();
        $contract = new ApiContract;
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        [$invitation] = WorkspaceInvitationFixture::create($workspace, $owner, 'first@example.com');
        $path = "/api/workspaces/{$workspace->id}/invitations";
        $template = '/api/workspaces/{workspace}/invitations';
        $contract->assertResponse($this->browserRequest('GET', $path)->assertUnauthorized(), 'GET', $template);
        $this->signIn($owner);
        $payload = ['account_id' => $owner->id, 'email' => 'new@example.com'];
        $contract->assertResponse($this->browserRequest('GET', $path)->assertOk(), 'GET', $template);
        $contract->assertResponse($this->browserRequest('POST', $path, $payload)->assertCreated(), 'POST', $template);
        $contract->assertResponse($this->browserRequest('POST', $path, $payload)->assertUnprocessable(), 'POST', $template);
        $contract->assertResponse($this->browserRequest('POST', $path, [...$payload, 'account_id' => $owner->id + 1])->assertConflict(), 'POST', $template);
        $resend = "{$path}/{$invitation->id}/resend";
        $resendTemplate = "{$template}/{invitation}/resend";
        $contract->assertResponse($this->browserRequest('POST', $resend, $payload)->assertOk(), 'POST', $resendTemplate);
        $contract->assertResponse($this->browserRequest('POST', $resend, $payload)->assertTooManyRequests(), 'POST', $resendTemplate);
        $contract->assertResponse($this->browserRequest('DELETE', "{$path}/{$invitation->id}", $payload)->assertNoContent(), 'DELETE', "{$template}/{invitation}");
        $contract->assertResponse($this->browserRequest('POST', $resend, $payload)->assertGone(), 'POST', $resendTemplate);
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new RedisException('Queue unavailable.'));
        $contract->assertResponse($this->browserRequest('POST', $path, [...$payload, 'email' => 'retry@example.com'])->assertServiceUnavailable(), 'POST', $template);
    }

    public function test_recipient_responses_and_both_permission_errors_match_the_contract(): void
    {
        $contract = new ApiContract;
        $owner = $this->user();
        $recipient = $this->user();
        $unverified = $this->user(verified: false);
        $workspace = $this->workspace($owner);
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, $recipient->email);
        $path = "/api/invitations/{$token}";
        $template = '/api/invitations/{token}';
        $this->signIn($unverified);
        $contract->assertResponse($this->browserRequest('GET', $path)->assertForbidden(), 'GET', $template);
        $this->signIn($owner);
        $contract->assertResponse($this->browserRequest('GET', $path)->assertForbidden(), 'GET', $template);
        $contract->assertResponse($this->browserRequest('POST', "{$path}/accept", ['account_id' => $owner->id])->assertForbidden(), 'POST', "{$template}/accept");
        $this->signIn($recipient);
        $payload = ['account_id' => $recipient->id];
        $contract->assertResponse($this->browserRequest('GET', $path)->assertOk(), 'GET', $template);
        $contract->assertResponse($this->browserRequest('POST', "{$path}/accept", $payload)->assertOk(), 'POST', "{$template}/accept");
        $managementPath = "/api/workspaces/{$workspace->id}/invitations";
        $managementTemplate = '/api/workspaces/{workspace}/invitations';
        $contract->assertResponse($this->browserRequest('GET', $managementPath)->assertForbidden(), 'GET', $managementTemplate);
        $workspace->users()->detach($recipient);
        $contract->assertResponse($this->browserRequest('GET', $managementPath)->assertNotFound(), 'GET', $managementTemplate);
        $contract->assertResponse($this->browserRequest('POST', "{$path}/accept", $payload)->assertGone(), 'POST', "{$template}/accept");
        $this->assertNotNull($invitation->refresh()->accepted_at);
    }
}
