<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RedisStore;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Sleep;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class RateLimitTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    public function test_resends_and_corrections_share_an_account_rate_limit_across_sessions_and_connections(): void
    {
        $user = $this->login();
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
        Redis::purge();
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->login($user);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();

        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $other = $this->login(UserFixture::create('other@example.com'));
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertSentToTimes($other, VerifyEmail::class, 1);
        $this->assertSame('alex@example.com', $user->refresh()->email);
    }

    public function test_invalid_corrections_do_not_consume_the_email_quota(): void
    {
        $user = $this->login();
        UserFixture::create('taken@example.com');
        foreach (['invalid', 'taken@example.com'] as $email) {
            $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => $email])
                ->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertOk();
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
    }

    public function test_invalid_corrections_still_have_a_shared_account_request_limit(): void
    {
        $user = $this->login();
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'invalid'])->assertUnprocessable();
        }
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->login($user);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests()->assertHeader('Retry-After');
        Notification::assertNothingSent();
    }

    public function test_the_account_email_lock_covers_delivery_and_is_released_afterwards(): void
    {
        $user = $this->login();
        $blocked = false;
        Notification::shouldReceive('send')->once()->andReturnUsing(function () use ($user, &$blocked): void {
            Redis::purge();
            $store = Cache::store('redis')->getStore();
            $this->assertInstanceOf(LockProvider::class, $store);
            $lock = $store->lock("verification-email:{$user->id}", 60);
            $blocked = ! $lock->get();
            if (! $blocked) {
                $lock->release();
            }
        });
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        $this->assertTrue($blocked);
        $store = Cache::store('redis')->getStore();
        $this->assertInstanceOf(LockProvider::class, $store);
        $lock = $store->lock("verification-email:{$user->id}", 60);
        try {
            $this->assertTrue($lock->get());
        } finally {
            $lock->release();
        }
    }

    public function test_the_hourly_email_limit_still_applies_after_each_short_cooldown_expires(): void
    {
        Config::set('verification.resend_interval_seconds', 1);
        $user = $this->login();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            if ($attempt % 2 === 0) {
                $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
            } else {
                $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => "corrected-{$attempt}@example.com"])
                    ->assertOk();
            }

            Sleep::sleep(2);
        }

        Redis::purge();
        $limited = $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
        $this->assertGreaterThan(3500, (int) $limited->headers->get('Retry-After'));
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'blocked@example.com'])->assertTooManyRequests();
        Notification::assertSentToTimes($user, VerifyEmail::class, 5);
        $this->assertSame('corrected-3@example.com', $user->refresh()->email);
    }

    public function test_resend_cooldown_uses_the_same_policy_as_the_rate_limiter(): void
    {
        Config::set('verification.resend_interval_seconds', 7);
        $user = $this->login();
        $this->browserRequest('POST', '/api/email/verification-notification')
            ->assertNoContent()->assertHeader('Retry-After', '7');
        $limited = $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
        $retryAfter = (int) $limited->headers->get('Retry-After');
        $this->assertGreaterThan(0, $retryAfter);
        $this->assertLessThanOrEqual(7, $retryAfter);
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
    }

    public function test_verification_attempts_are_rate_limited(): void
    {
        $user = $this->login();
        $link = "{$this->signedLink($user)}0";
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->browserRequest('POST', $link)->assertForbidden();
        }

        $this->browserRequest('POST', $link)->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
    }

    public function test_the_session_lock_covers_the_external_email_delivery_window(): void
    {
        $this->login();
        $session = $this->browserRequest('GET', '/api/session')->assertOk();
        $sessionId = $session->getCookie(Config::string('session.cookie'))?->getValue();
        $this->assertIsString($sessionId);
        $store = Cache::store('redis')->getStore();
        $this->assertInstanceOf(RedisStore::class, $store);
        $prefix = $store->getPrefix();
        $lockTtl = null;
        Notification::shouldReceive('send')->once()->andReturnUsing(function () use ($prefix, $sessionId, &$lockTtl): void {
            $lockTtl = Redis::ttl("{$prefix}session:{$sessionId}");
        });

        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();

        $this->assertIsInt($lockTtl);
        $this->assertGreaterThan(15, $lockTtl);
    }
}
