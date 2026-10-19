<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Notifications\WorkspaceInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\InteractsWithMail;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\WorkspaceInvitationFixture;
use Tests\TestCase;

class WorkspaceInvitationMailTest extends TestCase
{
    use InteractsWithMail;
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_branded_html_escapes_workspace_names_and_plain_text_preserves_the_same_link(): void
    {
        $this->freezeTime();
        $owner = $this->user();
        $workspace = $this->workspace($owner, '<img src=x onerror=alert(1)> & Support');
        [$invitation, $token] = WorkspaceInvitationFixture::create($workspace, $owner, 'new@example.com');
        $recipient = (new AnonymousNotifiable)->route('mail', $invitation->email);
        $notification = new WorkspaceInvitationNotification($invitation->id, $token);
        Notification::sendNow($recipient, $notification);
        $message = $this->sentEmail();
        $html = $message->getHtmlBody();
        $text = $message->getTextBody();
        $this->assertIsString($html);
        $this->assertIsString($text);
        $this->assertStringContainsString('alt="Caseward"', $html);
        $this->assertStringContainsString(e($workspace->name), $html);
        $this->assertStringNotContainsString('<img src=x', $html);
        $this->assertStringContainsString($workspace->name, $text);
        $url = "http://localhost:5173/invitations/{$token}";
        $this->assertSame(2, substr_count($html, 'href="'.$url.'"'));
        $this->assertStringContainsString($url, $text);
        $this->assertStringContainsString('verify it before accepting', $text);
        $this->assertStringContainsString($invitation->expires_at->utc()->format('j F Y \a\t H:i \U\T\C'), $text);
        $this->assertStringNotContainsString('<html', $text);
    }
}
