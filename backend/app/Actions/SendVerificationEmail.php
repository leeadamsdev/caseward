<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\User;
use Throwable;

class SendVerificationEmail
{
    public function send(User $user): bool
    {
        try {
            $user->sendEmailVerificationNotification();

            return true;
        } catch (Throwable $exception) {
            // Account changes have committed; report the failure and let the user retry delivery.
            report($exception);

            return false;
        }
    }
}
