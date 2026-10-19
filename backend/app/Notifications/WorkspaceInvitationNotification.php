<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\WorkspaceInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Config;

class WorkspaceInvitationNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(private readonly string $invitationId, private readonly string $token) {}

    /** @return list<string> */
    public function via(object $_): array
    {
        return ['mail'];
    }

    public function shouldSend(AnonymousNotifiable $notifiable, string $_): bool
    {
        $invitation = WorkspaceInvitation::query()->find($this->invitationId);

        return $invitation !== null && $invitation->isPending()
            && hash_equals($invitation->token_hash, hash('sha256', $this->token))
            && $notifiable->routeNotificationFor('mail') === $invitation->email;
    }

    public function toMail(AnonymousNotifiable $_): MailMessage
    {
        $invitation = WorkspaceInvitation::query()->with('workspace')->findOrFail($this->invitationId);
        $frontend = rtrim(Config::string('app.url'), '/');

        return (new MailMessage)
            ->subject('Workspace invitation | Caseward')
            ->action('View invitation', "{$frontend}/invitations/{$this->token}")
            ->view(['html' => 'mail.workspace-invitation', 'text' => 'mail.workspace-invitation-text'], [
                'email' => $invitation->email,
                'workspaceName' => $invitation->workspace->name,
                'expiresAt' => $invitation->expires_at->utc()->format('j F Y \a\t H:i \U\T\C'),
                'logoUrl' => Config::string('mail.logo_url'),
            ]);
    }
}
