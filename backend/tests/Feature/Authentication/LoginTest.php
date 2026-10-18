<?php

declare(strict_types=1);

namespace Tests\Feature\Authentication;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    #[DataProvider('incorrectCredentials')]
    public function test_incorrect_credentials_do_not_disclose_whether_the_account_exists(string $email, string $password): void
    {
        UserFixture::create(verified: true);
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

        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), ...$invalid])
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
        UserFixture::create(password: $password, verified: true);
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'password' => trim($password)])
            ->assertUnprocessable();
        $this->browserRequest('POST', '/api/login', [...UserFixture::credentials(), 'password' => $password])
            ->assertNoContent();
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    public function test_login_requires_a_first_party_origin_or_referer(): void
    {
        $this->withoutHeader('Origin');
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertForbidden();

        $this->withHeader('Referer', 'http://localhost:5173/login');
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest('POST', '/api/login')->assertUnprocessable();
    }

    public function test_login_attempts_are_rate_limited_independently_of_registration(): void
    {
        $this->browserRequest('GET', '/sanctum/csrf-cookie');

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertUnprocessable();
        }

        $this->browserRequest('POST', '/api/login', UserFixture::credentials())
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('POST', '/api/login', UserFixture::credentials(), headers: [
            'X-Forwarded-For' => '192.0.2.200', 'X-Real-IP' => '192.0.2.200',
        ])->assertTooManyRequests();
        $this->browserRequest('POST', '/api/register')->assertUnprocessable();

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertUnprocessable();
    }

    #[DataProvider('accountExistence')]
    public function test_login_attempts_against_an_account_are_limited_across_ips_sessions_and_connections(bool $exists): void
    {
        if ($exists) {
            UserFixture::create(verified: true);
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
        $this->browserRequest('POST', '/api/login', UserFixture::credentials())
            ->assertTooManyRequests()->assertHeader('Retry-After');
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();

        $this->browserRequest('POST', '/api/login', [
            ...UserFixture::credentials(), 'email' => 'another@example.com',
        ])->assertUnprocessable();
    }

    /** @return iterable<string, array{bool}> */
    public static function accountExistence(): iterable
    {
        yield 'existing account' => [true];
        yield 'unknown account' => [false];
    }
}
