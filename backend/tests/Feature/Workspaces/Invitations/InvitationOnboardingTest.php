<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces\Invitations;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Concerns\InteractsWithQueue;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class InvitationOnboardingTest extends TestCase
{
    use InteractsWithEmailVerification;
    use InteractsWithQueue;
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_a_new_invitee_can_register_verify_and_explicitly_join_using_real_mailpit_messages(): void
    {
        Notification::swap(new ChannelManager($this->app));
        Config::set('mail.default', 'smtp');
        $email = 'invitation-'.bin2hex(random_bytes(16)).'@example.test';
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        $ids = [];
        try {
            $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", ['account_id' => $owner->id, 'email' => $email])->assertCreated();
            $this->processDelivery();
            $invitation = $this->capture($email, 'Workspace invitation | Caseward');
            $ids[] = $invitation['id'];
            $this->assertStringContainsString('alt="Caseward"', $invitation['html']);
            $this->assertStringContainsString($workspace->name, $invitation['html']);
            $this->assertSame(1, preg_match('~/invitations/([a-f0-9]{64})~', $invitation['text'], $matches));
            $token = $matches[1] ?? null;
            $this->assertIsString($token);
            $this->browserRequest('POST', '/api/logout')->assertNoContent();
            $this->browserRequest('POST', '/api/register', [...UserFixture::registration(), 'email' => $email])->assertCreated();
            $recipient = User::query()->where('email', $email)->firstOrFail();
            $this->browserRequest('GET', "/api/invitations/{$token}")->assertForbidden()->assertJsonPath('code', 'email_unverified');
            $this->processDelivery();
            $verification = $this->capture($email, 'Verify your email | Caseward');
            $ids[] = $verification['id'];
            $this->assertSame(1, preg_match('~https?://\S+/email/verify/\S+~', $verification['text'], $links));
            $link = $links[0] ?? null;
            $this->assertIsString($link);
            $this->browserRequest('POST', $this->apiLink($link))->assertNoContent();
            $this->assertDatabaseCount('workspace_memberships', 1);
            $this->browserRequest('GET', "/api/invitations/{$token}")->assertOk()->assertJsonPath('data.workspace.name', $workspace->name);
            $this->browserRequest('POST', "/api/invitations/{$token}/accept", ['account_id' => $recipient->id])->assertOk()->assertJsonPath('data.role', 'member');
            $this->browserRequest('GET', "/api/workspaces/{$workspace->id}")->assertOk();
            $this->assertDatabaseCount('workspace_memberships', 2);
        } finally {
            if ($ids !== []) {
                Http::timeout(5)->delete('http://mailpit:8025/api/v1/messages', ['IDs' => $ids])->throw();
            }
        }
    }

    /** @return array{id: string, html: string, text: string} */
    private function capture(string $email, string $subject): array
    {
        $messages = Http::timeout(5)->get('http://mailpit:8025/api/v1/search', ['query' => "to:{$email}"])->throw()->json('messages');
        $this->assertIsArray($messages);
        $message = collect($messages)->firstWhere('Subject', $subject);
        $this->assertIsArray($message);
        $id = $message['ID'];
        $this->assertIsString($id);
        $captured = Http::timeout(5)->get("http://mailpit:8025/api/v1/message/{$id}")->throw();
        $html = $captured->json('HTML');
        $text = $captured->json('Text');
        $this->assertIsString($html);
        $this->assertIsString($text);
        $this->assertSame($email, $captured->json('To.0.Address'));

        return ['id' => $id, 'html' => $html, 'text' => $text];
    }
}
