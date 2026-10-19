<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use LogicException;

use function is_string;

class AuthServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Password::defaults(fn (): Password => Password::min(15)->max(128));

        ResetPassword::createUrlUsing(function (mixed $user, string $token): string {
            if (! $user instanceof User) {
                throw new LogicException('Password reset mail requires a Caseward user.');
            }

            $frontend = rtrim(Config::string('app.url'), '/');
            $query = http_build_query(['email' => $user->getEmailForPasswordReset()], encoding_type: PHP_QUERY_RFC3986);

            return "{$frontend}/reset-password/{$token}?{$query}";
        });

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
            $limiter->for('workspace-invitations', function (Request $request): array {
                $user = $request->user();
                abort_unless($user instanceof User, 401);

                return [Limit::perMinute(10)->by("minute:{$user->id}"), Limit::perHour(50)->by("hour:{$user->id}")];
            });

            $limiter->for('login', function (Request $request): array {
                $limits = [Limit::perMinute(5)->by("ip:{$request->ip()}")];
                $emailHash = $this->emailKey($request);
                if ($emailHash !== null) {
                    $limits[] = Limit::perMinute(10)->by("email:{$emailHash}");
                }

                return $limits;
            });

            $limiter->for('password-email', function (Request $request): array {
                $limits = [Limit::perMinute(5)->by("ip:{$request->ip()}")];
                $emailHash = $this->emailKey($request);
                if ($emailHash !== null) {
                    $limits[] = Limit::perMinute(1)->by("minute:{$emailHash}");
                    $limits[] = Limit::perHour(5)->by("hour:{$emailHash}");
                }

                return $limits;
            });

            $limiter->for('password-reset', function (Request $request): array {
                $limits = [Limit::perMinute(5)->by("ip:{$request->ip()}")];
                $emailHash = $this->emailKey($request);
                if ($emailHash !== null) {
                    $limits[] = Limit::perMinute(10)->by("email:{$emailHash}");
                }

                return $limits;
            });
        });
    }

    private function emailKey(Request $request): ?string
    {
        $email = $request->input('email');

        return is_string($email) ? hash('sha256', Str::lower(trim($email))) : null;
    }
}
