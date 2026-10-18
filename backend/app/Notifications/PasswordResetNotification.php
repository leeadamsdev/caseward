<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Password;
use LogicException;

class PasswordResetNotification extends ResetPassword implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function toMail(mixed $notifiable): MailMessage
    {
        if (! $notifiable instanceof User) {
            throw new LogicException('Password reset mail requires a Caseward user.');
        }

        return (new MailMessage)
            ->subject('Reset your password | Caseward')
            ->action('Reset password', $this->resetUrl($notifiable))
            ->view(['html' => 'mail.reset-password', 'text' => 'mail.reset-password-text'], [
                'email' => $notifiable->getEmailForPasswordReset(),
                'logoUrl' => Config::string('mail.logo_url'),
                'expireMinutes' => Config::integer('auth.passwords.users.expire'),
            ]);
    }

    public function shouldSend(User $user, string $_): bool
    {
        // Delayed retries must not send links that were used, replaced or invalidated by an email change.
        return Password::tokenExists($user, $this->token);
    }
}
