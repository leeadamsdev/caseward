<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Actions\RecoverPassword;
use App\Models\User;
use App\Notifications\PasswordResetConfirmationNotification;
use App\Notifications\PasswordResetNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Queue\RedisQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\TestCase;

class PasswordRecoveryTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Process real queued jobs on the test's database connection without committing its rollback transaction.
        Config::set('queue.connections.redis.after_commit', false);
        Notification::fake();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    protected function tearDown(): void
    {
        Redis::del('queues:default', 'queues:default:notify', 'queues:default:reserved', 'queues:default:delayed');
        parent::tearDown();
    }

    #[DataProvider('accountExistence')]
    public function test_recovery_has_the_same_response_and_queues_work_without_disclosing_account_existence(bool $exists): void
    {
        $user = $exists ? $this->user() : null;

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

    public function test_a_reset_consumes_the_token_preserves_verification_and_requires_sign_in(): void
    {
        Event::fake([PasswordReset::class]);
        $user = $this->user();
        $token = $this->token($user);
        $guestSession = $this->cookies[Config::string('session.cookie')];

        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))
            ->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');

        $user->refresh();
        $this->assertTrue(Hash::check($this->newPassword(), $user->password));
        $this->assertSame('argon2id', password_get_info($user->password)['algoName']);
        $this->assertFalse($user->hasVerifiedEmail());
        $this->assertNotSame($guestSession, $this->cookies[Config::string('session.cookie')]);
        $this->assertFalse(Password::tokenExists($user, $token));
        $this->assertGuest();
        Event::assertDispatched(PasswordReset::class, fn (PasswordReset $event): bool => $event->user->getAuthIdentifier() === $user->id);

        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_password_reset_link');
        $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => $this->newPassword()])->assertNoContent();
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.email_verified', false);
        $this->browserRequest('GET', '/api/user')->assertForbidden()->assertJsonPath('code', 'email_unverified');
    }

    #[DataProvider('rememberChoices')]
    public function test_reset_revokes_sessions_in_multiple_browsers_and_rejects_the_old_password(bool $remember): void
    {
        $user = $this->user(verified: true);
        $login = ['email' => $user->email, 'password' => 'correct horse battery staple', 'remember' => $remember];
        $this->browserRequest('POST', '/api/login', $login)->assertNoContent();
        $first = $this->cookies;
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $login)->assertNoContent();
        $second = $this->cookies;
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/reset-password', $this->reset($this->token($user)))->assertNoContent();
        $this->assertTrue($user->refresh()->hasVerifiedEmail());
        foreach ([$first, $second] as $cookies) {
            $this->cookies = $cookies;
            $this->browserRequest('GET', '/api/session')->assertUnauthorized();
            $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        }
        $this->browserRequest('POST', '/api/login', $login)->assertUnprocessable();
        $this->browserRequest('POST', '/api/login', [...$login, 'password' => $this->newPassword()])->assertNoContent();
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_only_a_successful_reset_sends_one_confirmation_to_the_account_address(): void
    {
        $this->freezeTime();
        $user = $this->user();
        $token = $this->token($user);
        Notification::fake();

        $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))->assertUnprocessable();
        Notification::assertNothingSent();
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
        Notification::assertSentOnDemand(PasswordResetConfirmationNotification::class,
            fn (PasswordResetConfirmationNotification $notification, array $channels, AnonymousNotifiable $notifiable): bool => $notifiable->routeNotificationFor('mail') === $user->email
                && $channels === ['mail']
                && $notification->resetAt->equalTo(now())
        );
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertUnprocessable();
        Notification::assertSentOnDemandOnce(PasswordResetConfirmationNotification::class);
        Notification::assertCount(1);
    }

    public function test_confirmation_waits_for_commit_and_is_discarded_on_rollback(): void
    {
        $user = $this->user();
        $hash = $user->password;
        $token = $this->token($user);
        Notification::fake();
        DB::beginTransaction();
        $this->assertTrue($this->app->make(RecoverPassword::class)->reset($user->email, $token, $this->newPassword()));
        Notification::assertNothingSent();
        DB::rollBack();
        Notification::assertNothingSent();
        $this->assertSame($hash, $user->refresh()->password);
    }

    public function test_a_confirmation_dispatch_failure_is_reported_without_failing_the_completed_reset(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        Exceptions::fake();
        $failure = new RuntimeException('Notification queue is unavailable.');
        $queue = $this->queue();
        Notification::swap(new ChannelManager($this->app));
        Queue::partialMock()->shouldReceive('connection')->with(null)->once()->andThrow($failure);

        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
        $this->assertTrue(Hash::check($this->newPassword(), $user->refresh()->password));
        $this->assertFalse(Password::tokenExists($user, $token));
        $this->assertSame(0, $queue->size());
        $this->assertGuest();
        Exceptions::assertReported(fn (RuntimeException $exception): bool => $exception === $failure);
        Exceptions::assertReportedCount(1);
    }

    public function test_reset_tokens_are_hashed_in_the_dedicated_expiring_store(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $key = hash('sha256', $user->email);
        $record = Cache::store('passwords')->get($key);
        $this->assertIsArray($record);
        $hash = $record[0];
        $this->assertIsString($hash);
        $this->assertNotSame($token, $hash);
        $this->assertTrue(Hash::check($token, $hash));
        $this->assertNull(Cache::store('redis')->get($key));
        $this->assertGreaterThan(1700, Redis::ttl("passwords:{$key}"));
        $this->assertLessThanOrEqual(1800, Redis::ttl("passwords:{$key}"));
    }

    public function test_expired_tokens_are_rejected_without_changing_the_account(): void
    {
        $this->freezeTime();
        $user = $this->user();
        $token = $this->token($user);
        $hash = $user->password;
        $this->travel(31)->minutes();

        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_password_reset_link');
        $this->assertSame($hash, $user->refresh()->password);
        Notification::assertSentOnDemandTimes(PasswordResetConfirmationNotification::class, 0);
    }

    public function test_a_replacement_link_revokes_the_previous_token(): void
    {
        $this->freezeTime();
        $user = $this->user();
        $old = $this->token($user);
        $this->travel(61)->seconds();
        $new = $this->token($user);

        $this->assertNotSame($old, $new);
        $this->browserRequest('POST', '/api/reset-password', $this->reset($old))->assertUnprocessable();
        $this->browserRequest('POST', '/api/reset-password', $this->reset($new))->assertNoContent();
    }

    public function test_wrong_tokens_unknown_accounts_and_another_accounts_token_have_the_same_error(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $other = $this->user('other@example.com');
        foreach ([
            $this->reset(str_repeat('a', 64)),
            [...$this->reset($token), 'email' => 'missing@example.com'],
            [...$this->reset($token), 'email' => $other->email],
        ] as $input) {
            $this->browserRequest('POST', '/api/reset-password', $input)->assertUnprocessable()->assertExactJson([
                'message' => 'This password reset link is invalid or has expired. Request a new link.',
                'code' => 'invalid_password_reset_link',
            ]);
        }
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->assertTrue(Hash::check('correct horse battery staple', $user->refresh()->password));
        Notification::assertSentOnDemandTimes(PasswordResetConfirmationNotification::class, 0);
    }

    public function test_invalid_requests_do_not_consume_a_valid_token(): void
    {
        $user = $this->user();
        $token = $this->token($user);
        $this->browserRequest('POST', '/api/reset-password', [...$this->reset($token), 'password_confirmation' => 'different'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
    }

    public function test_password_spaces_unicode_and_upper_bound_are_preserved(): void
    {
        $user = $this->user();
        $password = '  '.str_repeat("\u{1F510}", 124).'  ';
        $this->browserRequest('POST', '/api/reset-password', [
            ...$this->reset($this->token($user)), 'password' => $password, 'password_confirmation' => $password,
        ])->assertNoContent();
        $this->assertTrue(Hash::check($password, $user->refresh()->password));
        $this->assertFalse(Hash::check(trim($password), $user->password));
    }

    public function test_authenticated_users_cannot_use_recovery_endpoints(): void
    {
        $user = $this->user();
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
        $user = $this->user();
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
            $this->user();
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

    public function test_reset_attempts_are_limited_by_ip_and_address_across_connections(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$i}"]);
            $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))->assertUnprocessable();
        }
        Redis::purge();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.100']);
        $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('POST', '/api/reset-password', [...$this->reset(str_repeat('a', 64)), 'email' => 'different@example.com'])
            ->assertUnprocessable();
    }

    /** @param array<string, mixed> $invalid */
    #[DataProvider('invalidInput')]
    public function test_invalid_reset_input_is_rejected(array $invalid, string $field): void
    {
        $this->browserRequest('POST', '/api/reset-password', [...$this->reset(str_repeat('a', 64)), ...$invalid])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function invalidInput(): iterable
    {
        yield 'missing email' => [['email' => null], 'email'];
        yield 'array email' => [['email' => ['alex@example.com']], 'email'];
        yield 'malformed email' => [['email' => 'invalid'], 'email'];
        yield 'oversized email' => [['email' => str_repeat('a', 255)], 'email'];
        yield 'missing token' => [['token' => null], 'token'];
        yield 'array token' => [['token' => ['token']], 'token'];
        yield 'malformed token' => [['token' => str_repeat('x', 64)], 'token'];
        yield 'oversized token' => [['token' => str_repeat('a', 65)], 'token'];
        yield 'missing password' => [['password' => null], 'password'];
        yield 'array password' => [['password' => ['long passphrase']], 'password'];
        yield 'short password' => [['password' => str_repeat('a', 14), 'password_confirmation' => str_repeat('a', 14)], 'password'];
        yield 'oversized password' => [['password' => str_repeat('a', 129), 'password_confirmation' => str_repeat('a', 129)], 'password'];
        yield 'missing confirmation' => [['password_confirmation' => null], 'password'];
        yield 'different confirmation' => [['password_confirmation' => 'a different password'], 'password'];
    }

    /** @return iterable<string, array{bool}> */
    public static function accountExistence(): iterable
    {
        yield 'existing account' => [true];
        yield 'unknown account' => [false];
    }

    /** @return iterable<string, array{bool}> */
    public static function rememberChoices(): iterable
    {
        yield 'ordinary session' => [false];
        yield 'remembered session' => [true];
    }

    private function queue(): RedisQueue
    {
        $queue = Queue::connection('redis');
        $this->assertInstanceOf(RedisQueue::class, $queue);

        return $queue;
    }

    private function user(string $email = 'alex@example.com', bool $verified = false): User
    {
        $user = User::query()->create(['name' => 'Alex Example', 'email' => $email, 'password' => 'correct horse battery staple']);
        $user->forceFill(['email_verified_at' => $verified ? now() : null])->save();

        return $user;
    }

    private function token(User $user): string
    {
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $notification = Notification::sent($user, PasswordResetNotification::class)->last();
        $this->assertInstanceOf(PasswordResetNotification::class, $notification);

        return $notification->token;
    }

    /** @return array{email: string, token: string, password: string, password_confirmation: string} */
    private function reset(string $token): array
    {
        return ['email' => 'alex@example.com', 'token' => $token, 'password' => $this->newPassword(), 'password_confirmation' => $this->newPassword()];
    }

    private function newPassword(): string
    {
        return 'a new correct horse battery staple';
    }
}
