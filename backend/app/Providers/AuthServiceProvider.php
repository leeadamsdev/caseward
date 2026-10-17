<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AuthServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        VerifyEmail::createUrlUsing(function (User $user): string {
            $path = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
                'id' => $user->id,
                'hash' => sha1($user->getEmailForVerification()),
            ], absolute: false);

            // The frontend posts the signed API path; the proxy's host does not affect its signature.
            $frontend = rtrim(Config::string('app.url'), '/');

            return $frontend.Str::after($path, '/api');
        });

        $this->callAfterResolving(RateLimiter::class, function (RateLimiter $limiter): void {
            $limiter->for('verification-email', function (Request $request): array {
                $user = $request->user();
                abort_unless($user instanceof User, 401);
                $id = $user->id;

                return [
                    Limit::perMinute(1)->by("minute:{$id}"),
                    Limit::perHour(5)->by("hour:{$id}"),
                ];
            });
        });
    }
}
