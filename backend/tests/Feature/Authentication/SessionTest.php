<?php

declare(strict_types=1);

namespace Tests\Feature\Authentication;

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
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class SessionTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    public function test_guest_api_requests_return_json_without_requiring_an_accept_header(): void
    {
        foreach (['*/*', 'text/html', ''] as $accept) {
            $this->get('/api/session', ['Accept' => $accept])
                ->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        }
    }

    public function test_login_rotates_the_session_and_persists_only_the_expected_user_data(): void
    {
        $user = UserFixture::create(verified: true);
        $bootstrap = $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $sessionName = Config::string('session.cookie');
        $oldSessionId = $bootstrap->getCookie($sessionName)?->getValue();
        $oldToken = $this->cookies['XSRF-TOKEN'];

        $this->assertNotNull($oldSessionId);
        $this->assertTrue($bootstrap->getCookie($sessionName)->isHttpOnly());
        $this->assertSame('lax', $bootstrap->getCookie($sessionName)->getSameSite());
        $this->assertFalse($bootstrap->getCookie('XSRF-TOKEN')?->isHttpOnly());

        $login = $this->browserRequest('POST', '/api/login', [
            ...UserFixture::credentials(),
            'email' => '  ALEX@EXAMPLE.COM  ',
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
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $login = $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
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
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $login = $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $sessionId = $login->getCookie(Config::string('session.cookie'))?->getValue();

        Redis::expire("sessions:{$sessionId}", 1);
        Sleep::sleep(2);

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    public function test_logout_does_not_end_another_browser_session(): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $firstBrowser = $this->cookies;

        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $this->browserRequest('POST', '/api/logout')->assertNoContent();

        $this->cookies = $firstBrowser;
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_overlapping_session_requests_fail_safely_and_recover_when_the_lock_is_released(): void
    {
        Exceptions::fake();
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $login = $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
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

    #[DataProvider('rememberChoices')]
    public function test_changing_the_password_invalidates_existing_authentication(bool $remember): void
    {
        $user = UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => $remember])->assertNoContent();

        $user->update(['password' => 'a different long passphrase']);

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    #[DataProvider('rememberChoices')]
    public function test_deleted_users_cannot_continue_using_existing_sessions(bool $remember): void
    {
        $user = UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => $remember])->assertNoContent();

        $user->delete();

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
    }

    /** @return iterable<string, array{bool}> */
    public static function rememberChoices(): iterable
    {
        yield 'ordinary session' => [false];
        yield 'remembered session' => [true];
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
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', UserFixture::credentials(), csrf: false)->assertStatus(419);
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $this->browserRequest('POST', '/api/logout', csrf: false)->assertStatus(419);
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_untrusted_origins_cannot_use_session_authentication(): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $this->withHeader('Origin', 'https://untrusted.example');

        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        $this->browserRequest('POST', '/api/logout')->assertUnauthorized();
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertForbidden();
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
}
