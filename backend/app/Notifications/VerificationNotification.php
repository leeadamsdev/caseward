<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;

#[DeleteWhenMissingModels]
class VerificationNotification extends VerifyEmail implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(private readonly string $email) {}

    public function shouldSend(User $user, string $_): bool
    {
        // A delayed job must not mail an address corrected or verified since it was queued.
        return ! $user->hasVerifiedEmail() && hash_equals($this->email, $user->getEmailForVerification());
    }
}
