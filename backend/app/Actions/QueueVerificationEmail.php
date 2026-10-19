<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\User;
use Throwable;

class QueueVerificationEmail
{
    public function queue(User $user): bool
    {
        try {
            $user->sendEmailVerificationNotification();

            return true;
        } catch (Throwable $exception) {
            // Account changes have committed; report enqueue failures without claiming delivery.
            report($exception);

            return false;
        }
    }
}
