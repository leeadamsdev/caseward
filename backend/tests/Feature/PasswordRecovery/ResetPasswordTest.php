<?php

declare(strict_types=1);

namespace Tests\Feature\PasswordRecovery;

use App\Notifications\PasswordResetConfirmationNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithPasswordRecovery;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class ResetPasswordTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithPasswordRecovery;
    use RefreshDatabase;

    public function test_a_reset_consumes_the_token_preserves_verification_and_requires_sign_in(): void
    {
        Event::fake([PasswordReset::class]);
        $user = UserFixture::create();
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
        $user = UserFixture::create(verified: true);
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

    public function test_reset_tokens_are_hashed_in_the_dedicated_expiring_store(): void
    {
        $user = UserFixture::create();
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
        $user = UserFixture::create();
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
        $user = UserFixture::create();
        $old = $this->token($user);
        $this->travel(61)->seconds();
        $new = $this->token($user);

        $this->assertNotSame($old, $new);
        $this->browserRequest('POST', '/api/reset-password', $this->reset($old))->assertUnprocessable();
        $this->browserRequest('POST', '/api/reset-password', $this->reset($new))->assertNoContent();
    }

    public function test_wrong_tokens_unknown_accounts_and_another_accounts_token_have_the_same_error(): void
    {
        $user = UserFixture::create();
        $token = $this->token($user);
        $other = UserFixture::create('other@example.com');
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
        $user = UserFixture::create();
        $token = $this->token($user);
        $this->browserRequest('POST', '/api/reset-password', [...$this->reset($token), 'password_confirmation' => 'different'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
    }

    public function test_password_spaces_unicode_and_upper_bound_are_preserved(): void
    {
        $user = UserFixture::create();
        $password = '  '.str_repeat("\u{1F510}", 124).'  ';
        $this->browserRequest('POST', '/api/reset-password', [
            ...$this->reset($this->token($user)), 'password' => $password, 'password_confirmation' => $password,
        ])->assertNoContent();
        $this->assertTrue(Hash::check($password, $user->refresh()->password));
        $this->assertFalse(Hash::check(trim($password), $user->password));
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
    public static function rememberChoices(): iterable
    {
        yield 'ordinary session' => [false];
        yield 'remembered session' => [true];
    }
}
