<?php

declare(strict_types=1);

namespace App\Notifications;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Config;
use LogicException;

class PasswordResetConfirmationNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(public readonly CarbonImmutable $resetAt) {}

    /** @return list<string> */
    public function via(object $_): array
    {
        return ['mail'];
    }

    public function toMail(AnonymousNotifiable $notifiable): MailMessage
    {
        $email = $notifiable->routeNotificationFor('mail');
        if (! \is_string($email)) {
            throw new LogicException('Password reset confirmation requires an email recipient.');
        }
        $appUrl = rtrim(Config::string('app.url'), '/');

        return (new MailMessage)
            ->subject('Your password was reset | Caseward')
            ->action('Request a new reset link', "{$appUrl}/forgot-password")
            ->view(['html' => 'mail.password-reset-confirmation', 'text' => 'mail.password-reset-confirmation-text'], [
                'email' => $email,
                'logoUrl' => Config::string('mail.logo_url'),
                'resetAt' => $this->resetAt->utc()->format('j F Y \a\t H:i \U\T\C'),
            ]);
    }
}
