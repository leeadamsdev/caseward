<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use LogicException;

use function is_string;

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

        VerifyEmail::toMailUsing(function (mixed $user, string $url): MailMessage {
            if (! $user instanceof User) {
                throw new LogicException('Verification mail requires a Caseward user.');
            }

            return (new MailMessage)
                ->subject('Verify your email | Caseward')
                ->action('Verify email', $url)
                ->view(['html' => 'mail.verify-email', 'text' => 'mail.verify-email-text'], [
                    'email' => $user->getEmailForVerification(),
                    'logoUrl' => Config::string('mail.logo_url'),
                ]);
        });

        $this->callAfterResolving(RateLimiter::class, function (RateLimiter $limiter): void {
            $limiter->for('login', function (Request $request): array {
                $limits = [Limit::perMinute(5)->by("ip:{$request->ip()}")];
                $email = $request->input('email');

                if (is_string($email)) {
                    $emailHash = hash('sha256', Str::lower(trim($email)));
                    $limits[] = Limit::perMinute(10)->by("email:{$emailHash}");
                }

                return $limits;
            });
        });
    }
}
