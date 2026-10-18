<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Models\User;
use App\Notifications\PasswordResetConfirmationNotification;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Notification;
use LogicException;
use Throwable;

class SendPasswordResetConfirmation
{
    public function handle(PasswordReset $event): void
    {
        try {
            if (! $event->user instanceof User) {
                throw new LogicException('Password reset confirmation requires a Caseward user.');
            }

            // Snapshot the recipient instead of reloading a possibly changed address in the worker.
            Notification::route('mail', $event->user->email)
                ->notify(new PasswordResetConfirmationNotification(CarbonImmutable::now('UTC')));
        } catch (Throwable $exception) {
            // The password is already committed; a queue outage must not report the reset as failed.
            report($exception);
        }
    }
}
