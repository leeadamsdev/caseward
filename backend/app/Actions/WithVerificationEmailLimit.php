<?php

declare(strict_types=1);

namespace App\Actions;

use Closure;
use Illuminate\Cache\RateLimiter;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Validation\ValidationException;
use LogicException;

class WithVerificationEmailLimit
{
    public function __construct(private RateLimiter $limiter) {}

    /**
     * @template T
     *
     * @param  Closure(): T  $operation
     * @return T
     */
    public function run(int $accountId, Closure $operation): mixed
    {
        $store = Cache::store('redis')->getStore();
        if (! $store instanceof LockProvider) {
            throw new LogicException('Verification email limits require an atomic lock provider.');
        }

        // Serialize quota reservations across sessions, including the mail delivery window.
        return $store->lock("verification-email:{$accountId}", 60)->block(10, function () use ($accountId, $operation): mixed {
            $limits = [
                ["verification-email:minute:{$accountId}", 1, Config::integer('verification.resend_interval_seconds')],
                ["verification-email:hour:{$accountId}", 5, 3600],
            ];
            $retryAfter = 0;
            foreach ($limits as [$key, $maximum]) {
                if ($this->limiter->tooManyAttempts($key, $maximum)) {
                    $retryAfter = max(1, $retryAfter, $this->limiter->availableIn($key));
                }
            }
            if ($retryAfter > 0) {
                throw new ThrottleRequestsException('Too many attempts.', headers: ['Retry-After' => (string) $retryAfter]);
            }

            foreach ($limits as [$key, , $seconds]) {
                $this->limiter->hit($key, $seconds);
            }

            try {
                return $operation();
            } catch (ValidationException $exception) {
                // A uniqueness race can still reject an address after request validation.
                foreach ($limits as [$key, , $seconds]) {
                    $this->limiter->decrement($key, $seconds);
                }
                throw $exception;
            }
        });
    }
}
