<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Actions\RecoverPassword;
use App\Models\User;
use App\Notifications\PasswordResetNotification;
use Illuminate\Support\Facades\Notification;

trait InteractsWithPasswordRecovery
{
    use InteractsWithRecoveryQueue;

    protected function setUpInteractsWithPasswordRecovery(): void
    {
        Notification::fake();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    protected function token(User $user): string
    {
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $notification = Notification::sent($user, PasswordResetNotification::class)->last();
        $this->assertInstanceOf(PasswordResetNotification::class, $notification);

        return $notification->token;
    }

    /** @return array{email: string, token: string, password: string, password_confirmation: string} */
    protected function reset(string $token): array
    {
        return ['email' => 'alex@example.com', 'token' => $token, 'password' => $this->newPassword(), 'password_confirmation' => $this->newPassword()];
    }

    protected function newPassword(): string
    {
        return 'a new correct horse battery staple';
    }
}
