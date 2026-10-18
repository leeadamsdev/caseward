<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\User;
use App\Notifications\PasswordResetNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use LogicException;
use Throwable;

class RecoverPassword
{
    public function sendLink(string $email): void
    {
        $this->lock($email)->block(10, function () use ($email): void {
            Password::sendResetLink(['email' => $email], function (User $user, string $token): void {
                try {
                    $user->notify(new PasswordResetNotification($token));
                } catch (Throwable $exception) {
                    Password::deleteToken($user);
                    throw $exception;
                }
            });
        });
    }

    public function reset(string $email, string $token, string $password): bool
    {
        return $this->lock($email)->block(10, fn (): bool => DB::transaction(function () use ($email, $token, $password): bool {
            // Hold the current row against email correction while the broker validates and updates it.
            User::query()->where('email', $email)->lockForUpdate()->first();
            $status = Password::reset(compact('email', 'token', 'password'), function (User $user, string $password): void {
                $user->password = Hash::make($password);
                $user->save();
                DB::afterCommit(static function () use ($user): void {
                    event(new PasswordReset($user));
                });
            });

            return $status === Password::PASSWORD_RESET;
        })) === true;
    }

    private function lock(string $email): Lock
    {
        $store = Cache::store('redis')->getStore();
        if (! $store instanceof LockProvider) {
            throw new LogicException('Password recovery requires an atomic lock provider.');
        }

        $key = hash('sha256', $email);

        // Cover token creation and consumption across browser sessions and queue workers.
        return $store->lock("password-recovery:{$key}", 60);
    }
}
