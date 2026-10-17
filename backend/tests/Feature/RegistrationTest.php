<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_account_can_be_created_without_a_workspace(): void
    {
        $this->postJson('/api/register', [
            ...$this->registration(),
            'name' => '  Alex Example  ',
            'email' => '  Alex@Example.COM  ',
            'id' => 999,
            'email_verified_at' => '2026-01-01T00:00:00Z',
        ])->assertCreated()->assertExactJson([
            'data' => [
                'id' => User::query()->sole()->id,
                'name' => 'Alex Example',
                'email' => 'alex@example.com',
            ],
        ]);

        $user = User::query()->sole();

        $this->assertNotSame(999, $user->id);
        $this->assertNull($user->email_verified_at);
        $this->assertTrue(Hash::check($this->registration()['password'], $user->password));
        $this->assertSame('argon2id', password_get_info($user->password)['algoName']);
        $this->assertArrayNotHasKey('password', $user->toArray());
        $this->assertGuest();
    }

    public function test_duplicate_registration_does_not_change_the_existing_account(): void
    {
        $this->postJson('/api/register', $this->registration())->assertCreated();

        $this->postJson('/api/register', [
            ...$this->registration(),
            'name' => 'Another Person',
            'email' => ' ALEX@EXAMPLE.COM ',
            'password' => 'a different long passphrase',
            'password_confirmation' => 'a different long passphrase',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertSame('Alex Example', User::query()->sole()->name);
        $this->assertTrue(Hash::check($this->registration()['password'], User::query()->sole()->password));
    }

    public function test_a_duplicate_created_after_validation_returns_a_validation_error(): void
    {
        // Simulate another request inserting the account after validation succeeds.
        $this->app->afterResolving(RegisterRequest::class, function (): void {
            User::query()->create([
                'name' => 'Existing Person',
                'email' => 'alex@example.com',
                'password' => 'the existing account password',
            ]);
        });

        $this->postJson('/api/register', $this->registration())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertSame('Existing Person', User::query()->sole()->name);
        $this->assertTrue(Hash::check('the existing account password', User::query()->sole()->password));
    }

    public function test_missing_fields_return_json_without_an_accept_header(): void
    {
        $this->post('/api/register')->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'password']);

        $this->assertDatabaseCount('users', 0);
    }

    /** @param array<string, mixed> $invalid */
    #[DataProvider('invalidRegistrations')]
    public function test_invalid_registration_does_not_create_an_account(array $invalid, string $field): void
    {
        $this->postJson('/api/register', [...$this->registration(), ...$invalid])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertDatabaseCount('users', 0);
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function invalidRegistrations(): iterable
    {
        $longEmailLocalPart = str_repeat('a', 255);

        yield 'blank name' => [['name' => '   '], 'name'];
        yield 'long name' => [['name' => str_repeat('a', 256)], 'name'];
        yield 'array name' => [['name' => ['Alex']], 'name'];
        yield 'numeric name' => [['name' => 123], 'name'];
        yield 'null byte in name' => [['name' => "Alex\0Example"], 'name'];
        yield 'blank email' => [['email' => '   '], 'email'];
        yield 'malformed email' => [['email' => 'not-an-email'], 'email'];
        yield 'long email' => [['email' => "{$longEmailLocalPart}@example.com"], 'email'];
        yield 'array email' => [['email' => ['alex@example.com']], 'email'];
        yield 'numeric email' => [['email' => 123], 'email'];
        yield 'null email' => [['email' => null], 'email'];
        yield 'short password' => [[
            'password' => str_repeat('a', 14),
            'password_confirmation' => str_repeat('a', 14),
        ], 'password'];
        yield 'long password' => [[
            'password' => str_repeat('a', 129),
            'password_confirmation' => str_repeat('a', 129),
        ], 'password'];
        yield 'array password' => [['password' => ['a long passphrase']], 'password'];
        yield 'null password' => [['password' => null], 'password'];
        yield 'missing confirmation' => [['password_confirmation' => null], 'password'];
        yield 'wrong confirmation' => [['password_confirmation' => 'a different passphrase'], 'password'];
    }

    #[DataProvider('validPasswords')]
    public function test_passwords_are_preserved_without_trimming_or_truncation(string $password): void
    {
        $this->postJson('/api/register', [
            ...$this->registration(),
            'password' => $password,
            'password_confirmation' => $password,
        ])->assertCreated();

        $this->assertTrue(Hash::check($password, User::query()->sole()->password));
        $this->assertFalse(Hash::check("{$password}x", User::query()->sole()->password));
    }

    /** @return iterable<string, array{string}> */
    public static function validPasswords(): iterable
    {
        yield 'minimum length' => [str_repeat('a', 15)];
        yield 'maximum length' => [str_repeat('a', 128)];
        yield 'surrounding whitespace' => ['  correct horse battery staple  '];
        yield 'unicode over 72 bytes' => [str_repeat('🔐', 20)];
    }

    public function test_hash_looking_passwords_are_treated_as_plaintext_input(): void
    {
        $password = Hash::make('a different original password');

        $this->postJson('/api/register', [
            ...$this->registration(),
            'password' => $password,
            'password_confirmation' => $password,
        ])->assertCreated();

        $this->assertNotSame($password, User::query()->sole()->password);
        $this->assertTrue(Hash::check($password, User::query()->sole()->password));
    }

    public function test_the_database_prevents_duplicate_emails(): void
    {
        $this->postJson('/api/register', $this->registration())->assertCreated();

        $this->expectException(UniqueConstraintViolationException::class);

        DB::table('users')->insert([
            'name' => 'Another Person',
            'email' => 'alex@example.com',
            'password' => Hash::make('another long passphrase'),
        ]);
    }

    #[DataProvider('nonNormalizedEmails')]
    public function test_the_database_rejects_non_normalized_emails(string $email): void
    {
        $this->expectException(QueryException::class);
        $this->expectExceptionMessageIsOrContains('users_email_normalized');

        DB::table('users')->insert([
            'name' => 'Alex Example',
            'email' => $email,
            'password' => Hash::make('a sufficiently long passphrase'),
        ]);
    }

    /** @return iterable<string, array{string}> */
    public static function nonNormalizedEmails(): iterable
    {
        yield 'uppercase' => ['Alex@example.com'];
        yield 'surrounding whitespace' => [' alex@example.com '];
    }

    public function test_registration_attempts_are_rate_limited_per_ip_across_connections(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/register')->assertUnprocessable();
        }

        Redis::purge();

        $this->postJson('/api/register')->assertTooManyRequests()->assertHeader('Retry-After');

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
            ->postJson('/api/register')->assertUnprocessable();

        $this->assertDatabaseCount('users', 0);
    }

    /** @return array{name: string, email: string, password: string, password_confirmation: string} */
    private function registration(): array
    {
        return [
            'name' => 'Alex Example',
            'email' => 'alex@example.com',
            'password' => 'correct horse battery staple',
            'password_confirmation' => 'correct horse battery staple',
        ];
    }
}
