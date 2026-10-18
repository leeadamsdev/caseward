<?php

declare(strict_types=1);

namespace Tests\Feature\Authentication;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class RememberedSessionTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    #[DataProvider('ordinarySignIns')]
    public function test_persistence_requires_explicit_opt_in_and_keeps_the_normal_idle_limit(?bool $remember): void
    {
        UserFixture::create(verified: true);
        $input = UserFixture::credentials();
        if ($remember !== null) {
            $input['remember'] = $remember;
        }

        $response = $this->browserRequest('POST', '/api/login', $input)->assertNoContent();
        $cookie = $response->getCookie(Config::string('session.cookie'));
        $this->assertNotNull($cookie);
        $this->assertSame(0, $cookie->getExpiresTime());
        $this->assertGreaterThan(7100, Redis::ttl("sessions:{$cookie->getValue()}"));
        $this->assertLessThanOrEqual(7200, Redis::ttl("sessions:{$cookie->getValue()}"));
    }

    public function test_opt_in_issues_a_protected_cookie_and_a_thirty_day_server_session(): void
    {
        UserFixture::create(verified: true);
        $bootstrap = $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $original = $bootstrap->getCookie(Config::string('session.cookie'))?->getValue();
        $this->assertNotNull($original);
        $response = $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $cookie = $response->getCookie(Config::string('session.cookie'));
        $this->assertNotNull($cookie);
        $this->assertSame(now()->addDays(30)->getTimestamp(), $cookie->getExpiresTime());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertNotSame($original, $cookie->getValue());
        $this->assertEquals(0, Redis::exists("sessions:{$original}"));
        $this->assertGreaterThan(2_591_900, Redis::ttl("sessions:{$cookie->getValue()}"));
        $this->assertLessThanOrEqual(2_592_000, Redis::ttl("sessions:{$cookie->getValue()}"));
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_remembered_sessions_survive_a_browser_restart_without_extending_the_original_deadline(): void
    {
        UserFixture::create(verified: true);
        $sessionName = Config::string('session.cookie');
        $response = $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $deadline = $response->getCookie($sessionName)?->getExpiresTime();

        // Keep only the persistent session cookie, as a new browser process would.
        $this->cookies = [$sessionName => $this->cookies[$sessionName]];
        Redis::purge();
        $this->travel(3)->days();
        $response = $this->browserRequest('GET', '/api/user')->assertOk();
        $this->assertSame($deadline, $response->getCookie($sessionName)?->getExpiresTime());
        $id = $response->getCookie($sessionName)?->getValue();
        $this->assertNotNull($id);
        $this->assertGreaterThan(2_332_700, Redis::ttl("sessions:{$id}"));
        $this->assertLessThanOrEqual(2_332_800, Redis::ttl("sessions:{$id}"));
    }

    public function test_the_absolute_deadline_is_enforced_even_when_an_expired_cookie_is_replayed(): void
    {
        UserFixture::create(verified: true);
        $response = $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $rememberedCookies = $this->cookies;
        $id = $response->getCookie(Config::string('session.cookie'))?->getValue();
        $this->assertNotNull($id);
        $this->travel(30 * 24 - 1)->hours();
        $this->browserRequest('GET', '/api/session')->assertOk();
        $this->assertGreaterThan(3500, Redis::ttl("sessions:{$id}"));
        $this->assertLessThanOrEqual(3600, Redis::ttl("sessions:{$id}"));

        // The application clock moves; Valkey still retains the record, proving server-side enforcement.
        $this->travel(1)->hours();
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $this->assertEquals(0, Redis::exists("sessions:{$id}"));
        $this->cookies = $rememberedCookies;
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $response = $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $this->assertSame(0, $response->getCookie(Config::string('session.cookie'))?->getExpiresTime());
    }

    public function test_logout_revokes_only_the_current_browser_and_prevents_cookie_replay(): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $first = $this->cookies;
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $second = $this->cookies;
        $response = $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->assertSame(0, $response->getCookie(Config::string('session.cookie'))?->getExpiresTime());
        $this->cookies = $second;
        $this->browserRequest('GET', '/api/user')->assertUnauthorized();
        $this->cookies = $first;
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_another_browser_cannot_inherit_the_remembered_duration(): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie');
        $response = $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent();
        $cookie = $response->getCookie(Config::string('session.cookie'));
        $this->assertNotNull($cookie);
        $this->assertSame(0, $cookie->getExpiresTime());
        $this->assertLessThanOrEqual(7200, Redis::ttl("sessions:{$cookie->getValue()}"));
        $this->assertSame(120, Config::integer('session.lifetime'));
    }

    public function test_failed_sign_in_does_not_create_a_remembered_session(): void
    {
        UserFixture::create(verified: true);
        $response = $this->browserRequest('POST', '/api/login', [
            ...UserFixture::credentials(), 'password' => 'an incorrect long passphrase', 'remember' => true,
        ])->assertUnprocessable();
        $this->assertSame(0, $response->getCookie(Config::string('session.cookie'))?->getExpiresTime());
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
    }

    public function test_a_new_sign_in_cannot_inherit_persistence_from_a_deleted_account(): void
    {
        $user = UserFixture::create(verified: true);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $user->delete();
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $replacement = UserFixture::create(verified: true);

        $response = $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => false])->assertNoContent();
        $cookie = $response->getCookie(Config::string('session.cookie'));
        $this->assertNotNull($cookie);
        $this->assertSame(0, $cookie->getExpiresTime());
        $this->assertLessThanOrEqual(7200, Redis::ttl("sessions:{$cookie->getValue()}"));
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $replacement->id);
    }

    public function test_remembered_unverified_users_still_cannot_access_verified_routes(): void
    {
        UserFixture::create(verified: false);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $this->travel(3)->days();
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.email_verified', false);
        $this->browserRequest('GET', '/api/user')->assertForbidden()->assertJsonPath('code', 'email_unverified');
    }

    public function test_registration_does_not_opt_in_to_remembered_sign_in(): void
    {
        Notification::fake();
        $response = $this->browserRequest('POST', '/api/register', [
            ...UserFixture::credentials(), 'name' => 'Alex Example',
            'password_confirmation' => 'correct horse battery staple', 'remember' => true,
        ])->assertCreated();
        $this->assertSame(0, $response->getCookie(Config::string('session.cookie'))?->getExpiresTime());
    }

    public function test_secure_cookie_configuration_also_applies_to_remembered_sessions(): void
    {
        UserFixture::create(verified: true);
        Config::set('session.secure', true);
        $response = $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $this->assertTrue($response->getCookie(Config::string('session.cookie'))?->isSecure());
    }

    public function test_remembered_authentication_fails_closed_during_a_valkey_outage_and_recovers(): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => true])->assertNoContent();
        $cookies = $this->cookies;
        Exceptions::fake();
        Config::set('database.redis.default.port', 1);
        $this->app->forgetInstance('redis');
        Redis::clearResolvedInstance('redis');
        Cache::purge('redis');
        try {
            $this->browserRequest('GET', '/api/user')->assertServiceUnavailable();
        } finally {
            Config::set('database.redis.default.port', 6379);
            $this->app->forgetInstance('redis');
            Redis::clearResolvedInstance('redis');
            Cache::purge('redis');
        }
        $this->cookies = $cookies;
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    #[DataProvider('invalidChoices')]
    public function test_only_a_json_boolean_is_accepted_for_remember_me(mixed $remember): void
    {
        UserFixture::create(verified: true);
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'remember' => $remember])
            ->assertUnprocessable()->assertJsonValidationErrors('remember');
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
    }

    /** @return iterable<string, array{bool|null}> */
    public static function ordinarySignIns(): iterable
    {
        yield 'omitted' => [null];
        yield 'unchecked' => [false];
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidChoices(): iterable
    {
        yield 'null' => [null];
        yield 'string true' => ['true'];
        yield 'string false' => ['false'];
        yield 'checkbox string' => ['on'];
        yield 'integer one' => [1];
        yield 'integer zero' => [0];
        yield 'array' => [[true]];
    }
}
