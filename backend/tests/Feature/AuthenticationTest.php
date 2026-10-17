<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Cache\RedisStore;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Sleep;
use PHPUnit\Framework\Attributes\DataProvider;
use RedisException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    public function test_login_rotates_the_session_and_persists_only_the_expected_user_data(): void
    {
        $user = $this->createUser();
        $bootstrap = $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $sessionName = Config::string('session.cookie');
        $oldSessionId = $bootstrap->getCookie($sessionName)?->getValue();
        $oldToken = $this->cookies['XSRF-TOKEN'];

        $this->assertNotNull($oldSessionId);
        $this->assertTrue($bootstrap->getCookie($sessionName)->isHttpOnly());
        $this->assertSame('lax', $bootstrap->getCookie($sessionName)->getSameSite());
        $this->assertFalse($bootstrap->getCookie('XSRF-TOKEN')?->isHttpOnly());

        $login = $this->browserRequest('POST', '/api/login', [
            ...$this->credentials(),
            'email' => '  ALEX@EXAMPLE.COM  ',
            'remember' => true,
        ])->assertNoContent();

        $sessionId = $login->getCookie($sessionName)?->getValue();
        $this->assertNotSame($oldSessionId, $sessionId);
        $this->assertNotSame($oldToken, $this->cookies['XSRF-TOKEN']);
        $this->assertEquals(0, Redis::exists("sessions:{$oldSessionId}"));
        $this->assertEquals(1, Redis::exists("sessions:{$sessionId}"));
        $this->assertGreaterThan(7100, Redis::ttl("sessions:{$sessionId}"));
        $guard = Auth::guard('web');
        $this->assertInstanceOf(SessionGuard::class, $guard);
        $this->assertArrayNotHasKey($guard->getRecallerName(), $this->cookies);

        $this->browserRequest('GET', '/api/user')->assertOk()->assertExactJson([
            'data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'email_verified' => true],
        ])->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_logout_invalidates_the_session_and_old_cookies_cannot_be_replayed(): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $login = $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $authenticatedCookies = $this->cookies;
        $sessionId = $login->getCookie(Config::string('session.cookie'))?->getValue();

        $logout = $this->browserRequest('POST', '/api/logout')->assertNoContent();

        $this->assertNotSame($sessionId, $logout->getCookie(Config::string('session.cookie'))?->getValue());
        $this->assertEquals(0, Redis::exists("sessions:{$sessionId}"));
        $this->assertNotSame($authenticatedCookies['XSRF-TOKEN'], $this->cookies['XSRF-TOKEN']);
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();

        $this->cookies = $authenticatedCookies;
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_expired_sessions_are_rejected(): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $login = $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $sessionId = $login->getCookie(Config::string('session.cookie'))?->getValue();

        Redis::expire("sessions:{$sessionId}", 1);
        Sleep::sleep(2);

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_logout_does_not_end_another_browser_session(): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $firstBrowser = $this->cookies;

        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $this->browserRequest('POST', '/api/logout')->assertNoContent();

        $this->cookies = $firstBrowser;
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_overlapping_session_requests_fail_safely_and_recover_when_the_lock_is_released(): void
    {
        Exceptions::fake();
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $login = $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $sessionId = $login->getCookie(Config::string('session.cookie'))?->getValue();
        $authenticatedCookies = $this->cookies;
        $store = Cache::store('redis')->getStore();
        $this->assertInstanceOf(RedisStore::class, $store);
        $lock = $store->lock("session:{$sessionId}", 10);
        $this->assertTrue($lock->get());
        Config::set('session.block_wait_seconds', 0);

        try {
            $this->browserRequest('GET', '/api/user')->assertServiceUnavailable()->assertExactJson([
                'message' => 'Service temporarily unavailable. Please try again.',
            ]);
            Exceptions::assertReported(LockTimeoutException::class);

            $this->cookies = [];
            $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        } finally {
            $lock->release();
        }

        $this->cookies = $authenticatedCookies;
        $this->browserRequest('GET', '/api/user')->assertOk();
        $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_changing_the_password_invalidates_existing_authentication(): void
    {
        $user = $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();

        $user->update(['password' => 'a different long passphrase']);

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_deleted_users_cannot_continue_using_existing_sessions(): void
    {
        $user = $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();

        $user->delete();

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    #[DataProvider('incorrectCredentials')]
    public function test_incorrect_credentials_do_not_disclose_whether_the_account_exists(string $email, string $password): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', compact('email', 'password'))
            ->assertUnprocessable()->assertExactJson([
                'message' => __('auth.failed'),
                'errors' => ['email' => [__('auth.failed')]],
            ]);

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    /** @return iterable<string, array{string, string}> */
    public static function incorrectCredentials(): iterable
    {
        yield 'wrong password' => ['alex@example.com', 'a different long passphrase'];
        yield 'unknown email' => ['unknown@example.com', 'correct horse battery staple'];
    }

    /** @param array<string, mixed> $invalid */
    #[DataProvider('invalidLogins')]
    public function test_invalid_input_is_rejected(array $invalid, string $field): void
    {
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', [...$this->credentials(), ...$invalid])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function invalidLogins(): iterable
    {
        yield 'missing email' => [['email' => null], 'email'];
        yield 'blank email' => [['email' => '   '], 'email'];
        yield 'array email' => [['email' => ['alex@example.com']], 'email'];
        yield 'malformed email' => [['email' => 'not-an-email'], 'email'];
        yield 'oversized email' => [['email' => str_repeat('a', 255)], 'email'];
        yield 'missing password' => [['password' => null], 'password'];
        yield 'blank password' => [['password' => ''], 'password'];
        yield 'array password' => [['password' => ['a long passphrase']], 'password'];
        yield 'oversized password' => [['password' => str_repeat('a', 129)], 'password'];
    }

    public function test_passwords_are_not_trimmed_or_truncated(): void
    {
        $unicode = str_repeat("\u{1F510}", 20);
        $password = "  {$unicode}  ";
        $this->createUser($password);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', [...$this->credentials(), 'password' => trim($password)])
            ->assertUnprocessable();
        $this->browserRequest('POST', '/api/login', [...$this->credentials(), 'password' => $password])
            ->assertNoContent();
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_guest_requests_are_rejected_and_bearer_tokens_are_not_supported(): void
    {
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        $this->browserRequest('POST', '/api/logout')->assertUnauthorized();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/logout')->assertUnauthorized();

        $this->withHeader('Authorization', 'Bearer 1|unsupported-token');
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();

        $this->cookies[Config::string('session.cookie')] = 'tampered-cookie';
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_login_and_logout_require_a_valid_csrf_token(): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', $this->credentials(), csrf: false)->assertStatus(419);
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $this->browserRequest('POST', '/api/logout', csrf: false)->assertStatus(419);
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_untrusted_origins_cannot_use_session_authentication(): void
    {
        $this->createUser();
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertNoContent();
        $this->withHeader('Origin', 'https://untrusted.example');

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        $this->browserRequest('POST', '/api/logout')->assertUnauthorized();
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertForbidden();
    }

    public function test_login_requires_a_first_party_origin_or_referer(): void
    {
        $this->withoutHeader('Origin');
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertForbidden();

        $this->withHeader('Referer', 'http://localhost:5173/login');
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest('POST', '/api/login')->assertUnprocessable();
    }

    public function test_login_attempts_are_rate_limited_independently_of_registration(): void
    {
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->browserRequest('POST', '/api/login', $this->credentials())->assertUnprocessable();
        }

        $this->browserRequest('POST', '/api/login', $this->credentials())
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('POST', '/api/login', $this->credentials(), headers: [
            'X-Forwarded-For' => '192.0.2.200', 'X-Real-IP' => '192.0.2.200',
        ])->assertTooManyRequests();
        $this->browserRequest('POST', '/api/register')->assertUnprocessable();

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->browserRequest('POST', '/api/login', $this->credentials())->assertUnprocessable();
    }

    #[DataProvider('accountExistence')]
    public function test_login_attempts_against_an_account_are_limited_across_ips_sessions_and_connections(bool $exists): void
    {
        if ($exists) {
            $this->createUser();
        }

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->cookies = [];
            $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$attempt}"]);
            $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
            $email = $attempt % 2 === 0 ? 'alex@example.com' : '  ALEX@EXAMPLE.COM  ';

            $this->browserRequest('POST', '/api/login', [
                'email' => $email,
                'password' => 'a different long passphrase',
            ])->assertUnprocessable();
        }

        Redis::purge();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.100']);
        $this->browserRequest('POST', '/api/login', $this->credentials())
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();

        $this->browserRequest('POST', '/api/login', [
            ...$this->credentials(), 'email' => 'another@example.com',
        ])->assertUnprocessable();
    }

    /** @return iterable<string, array{bool}> */
    public static function accountExistence(): iterable
    {
        yield 'existing account' => [true];
        yield 'unknown account' => [false];
    }

    public function test_authentication_fails_closed_when_valkey_is_unavailable(): void
    {
        Exceptions::fake();
        Config::set('database.redis.default.port', 1);
        Redis::purge();

        $this->browserRequest('GET', '/api/user')->assertServiceUnavailable()->assertExactJson([
            'message' => 'Service temporarily unavailable. Please try again.',
        ]);

        Exceptions::assertReported(RedisException::class);
    }

    private function createUser(string $password = 'correct horse battery staple'): User
    {
        $user = User::query()->create([
            'name' => 'Alex Example',
            'email' => 'alex@example.com',
            'password' => $password,
        ]);

        $user->forceFill(['email_verified_at' => now()])->save();

        return $user;
    }

    /** @return array{email: string, password: string} */
    private function credentials(): array
    {
        return ['email' => 'alex@example.com', 'password' => 'correct horse battery staple'];
    }
}
