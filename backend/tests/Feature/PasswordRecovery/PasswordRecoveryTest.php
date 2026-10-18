<?php

declare(strict_types=1);

namespace Tests\Feature\PasswordRecovery;

use App\Notifications\PasswordResetNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithPasswordRecovery;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class PasswordRecoveryTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithPasswordRecovery;
    use RefreshDatabase;

    #[DataProvider('accountExistence')]
    public function test_recovery_has_the_same_response_and_queues_work_without_disclosing_account_existence(bool $exists): void
    {
        $user = $exists ? UserFixture::create() : null;

        $this->browserRequest('POST', '/api/forgot-password', ['email' => '  ALEX@EXAMPLE.COM  '])
            ->assertStatus(202)->assertExactJson([
                'message' => 'If an account matches that email address, we will send a password reset link.',
            ])->assertHeader('Cache-Control', 'no-store, private');
        Notification::assertNothingSent();
        $this->assertGuest();
        $queue = $this->queue();
        $this->assertSame(1, $queue->size());
        $job = $queue->pop();
        $this->assertNotNull($job);
        $this->assertStringNotContainsString('alex@example.com', $job->getRawBody());
        $job->fire();
        $this->assertSame(0, $queue->size());

        if ($user !== null) {
            Notification::assertSentTo($user, PasswordResetNotification::class);
        } else {
            Notification::assertNothingSent();
            $this->assertDatabaseCount('users', 0);
        }
    }

    public function test_authenticated_users_cannot_use_recovery_endpoints(): void
    {
        $user = UserFixture::create();
        $token = $this->token($user);
        $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => 'correct horse battery staple'])->assertNoContent();
        $this->browserRequest('POST', '/api/forgot-password', ['email' => $user->email])->assertForbidden();
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertForbidden();
        $this->assertSame(0, $this->queue()->size());
        $this->assertTrue(Password::tokenExists($user, $token));
    }

    public function test_untrusted_origins_cannot_use_recovery_endpoints(): void
    {
        $this->withHeader('Origin', 'https://untrusted.example');
        $this->browserRequest('POST', '/api/forgot-password', ['email' => 'alex@example.com'])->assertForbidden();
        $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))->assertForbidden();
        $this->assertSame(0, $this->queue()->size());
    }

    public function test_both_endpoints_require_csrf_protection(): void
    {
        $this->browserRequest('POST', '/api/forgot-password', ['email' => 'alex@example.com'], csrf: false)->assertStatus(419);
        $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)), csrf: false)->assertStatus(419);
        $this->assertSame(0, $this->queue()->size());
    }

    public function test_invalid_email_does_not_enqueue_recovery_or_consume_an_address_quota(): void
    {
        $this->browserRequest('POST', '/api/forgot-password', ['email' => ['alex@example.com']])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame(0, $this->queue()->size());
        $this->browserRequest('POST', '/api/forgot-password', ['email' => 'alex@example.com'])->assertStatus(202);
    }

    public function test_recovery_fails_closed_during_a_valkey_outage_without_changing_the_account(): void
    {
        Exceptions::fake();
        $user = UserFixture::create();
        $hash = $user->password;
        Config::set('database.redis.default.port', 1);
        $this->app->forgetInstance('redis');
        Redis::clearResolvedInstance('redis');
        Cache::purge('redis');
        try {
            $this->browserRequest('POST', '/api/forgot-password', ['email' => $user->email])->assertServiceUnavailable();
            $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))->assertServiceUnavailable();
            $this->assertSame($hash, $user->refresh()->password);
        } finally {
            Config::set('database.redis.default.port', 6379);
            $this->app->forgetInstance('redis');
            Redis::clearResolvedInstance('redis');
            Cache::purge('redis');
        }
        $this->assertSame(0, $this->queue()->size());
    }

    #[DataProvider('accountExistence')]
    public function test_address_limits_apply_across_ips_and_do_not_depend_on_account_existence(bool $exists): void
    {
        if ($exists) {
            UserFixture::create();
        }
        $this->browserRequest('POST', '/api/forgot-password', ['email' => 'alex@example.com'])->assertStatus(202);
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->browserRequest('POST', '/api/forgot-password', ['email' => '  ALEX@EXAMPLE.COM  '])
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertSame(1, $this->queue()->size());
    }

    public function test_recovery_requests_are_limited_by_ip_separately_from_sign_in(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->browserRequest('POST', '/api/forgot-password', ['email' => "person{$i}@example.com"])->assertStatus(202);
        }
        $this->browserRequest('POST', '/api/forgot-password', ['email' => 'another@example.com'])->assertTooManyRequests();
        $this->browserRequest('POST', '/api/login')->assertUnprocessable();
        $this->assertSame(5, $this->queue()->size());
    }

    /** @return iterable<string, array{bool}> */
    public static function accountExistence(): iterable
    {
        yield 'existing account' => [true];
        yield 'unknown account' => [false];
    }
}
