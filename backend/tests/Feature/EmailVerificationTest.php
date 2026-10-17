<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Requests\UpdateEmailRequest;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RedisStore;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpClient\Exception\TransportException as HttpTransportException;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    public function test_registration_sends_an_expiring_frontend_link_and_establishes_a_restricted_session(): void
    {
        $oldCookies = $this->cookies;
        $oldToken = $this->cookies['XSRF-TOKEN'];
        $this->browserRequest('POST', '/api/register', $this->registration())
            ->assertCreated()->assertJsonPath('meta.verification_email_sent', true);
        $user = User::query()->sole();
        $registeredCookies = $this->cookies;
        $this->cookies = $oldCookies;
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $this->cookies = $registeredCookies;
        $this->browserRequest('POST', '/api/email/verification-notification', headers: ['X-XSRF-TOKEN' => $oldToken])->assertStatus(419);

        $this->browserRequest('GET', '/api/session')->assertOk()->assertExactJson([
            'data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'email_verified' => false],
        ])->assertHeader('Cache-Control', 'no-store, private');
        $this->browserRequest('GET', '/api/user', headers: ['Accept' => ''])
            ->assertForbidden()->assertExactJson([
                'message' => 'Verify your email address before continuing.',
                'code' => 'email_unverified',
            ]);
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
        $notification = Notification::sent($user, VerifyEmail::class)->sole();
        $this->assertInstanceOf(VerifyEmail::class, $notification);
        $link = $notification->toMail($user)->actionUrl;
        $this->assertStringStartsWith('http://localhost:5173/email/verify/', $link);
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $this->assertIsString($query['expires']);
        $this->assertEqualsWithDelta(now()->addHour()->timestamp, (int) $query['expires'], 2);
        $this->assertArrayHasKey('signature', $query);
        $this->browserRequest('POST', $this->apiLink($link))->assertNoContent();
        $this->browserRequest('GET', '/api/user')->assertOk()->assertJsonPath('data.email_verified', true);
    }

    public function test_verification_rotates_the_session_and_repeated_use_is_idempotent(): void
    {
        $user = $this->login();
        Event::fake([Verified::class]);
        $link = $this->signedLink($user);
        $oldCookies = $this->cookies;
        $oldToken = $this->cookies['XSRF-TOKEN'];

        $this->browserRequest('GET', $link)->assertStatus(405);
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        $this->browserRequest('POST', $link)->assertNoContent();
        $this->assertTrue($user->refresh()->hasVerifiedEmail());
        $verifiedAt = $user->email_verified_at;
        Event::assertDispatched(Verified::class, fn (Verified $event): bool => $event->user instanceof User && $event->user->is($user));

        $verifiedCookies = $this->cookies;
        $this->cookies = $oldCookies;
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $this->cookies = $verifiedCookies;
        $this->browserRequest('POST', $link, headers: ['X-XSRF-TOKEN' => $oldToken])->assertStatus(419);

        $this->browserRequest('POST', $link)->assertNoContent();
        $this->assertEquals($verifiedAt, $user->refresh()->email_verified_at);
        Event::assertDispatchedTimes(Verified::class, 1);
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.email_verified', true);
        $this->browserRequest('GET', '/api/user')->assertOk();
    }

    /** @param 'expired'|'missing signature'|'tampered signature'|'tampered parameters'|'tampered account' $kind */
    #[DataProvider('invalidLinks')]
    public function test_invalid_or_expired_links_cannot_verify_an_account(string $kind): void
    {
        $user = $this->login();
        Event::fake([Verified::class]);
        $link = $this->signedLink($user);
        $link = match ($kind) {
            'expired' => URL::temporarySignedRoute('verification.verify', now()->subMinute(), ['id' => $user->id, 'hash' => sha1($user->email)], absolute: false),
            'missing signature' => Str::before($link, '&signature='),
            'tampered signature' => "{$link}0",
            'tampered parameters' => "{$link}&extra=value",
            'tampered account' => Str::replaceFirst("/{$user->id}/", '/999/', $link),
        };

        $this->browserRequest('POST', $link)->assertForbidden()->assertJsonPath('code', 'invalid_verification_link');
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        Event::assertNotDispatched(Verified::class);
        $this->browserRequest('GET', '/api/user')->assertForbidden();
    }

    /** @return iterable<string, array{string}> */
    public static function invalidLinks(): iterable
    {
        foreach (['expired', 'missing signature', 'tampered signature', 'tampered parameters', 'tampered account'] as $kind) {
            yield $kind => [$kind];
        }
    }

    public function test_a_valid_link_for_another_account_is_rejected(): void
    {
        $user = $this->login();
        $other = $this->createUser('other@example.com');
        $this->browserRequest('POST', $this->signedLink($other))->assertForbidden()->assertJsonPath('code', 'verification_account_mismatch');
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        $this->assertFalse($other->refresh()->hasVerifiedEmail());
    }

    public function test_the_email_hash_is_checked_even_when_the_signature_is_valid(): void
    {
        $user = $this->login();
        $link = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1('wrong@example.com'),
        ], absolute: false);

        $this->browserRequest('POST', $link)->assertForbidden()->assertJsonPath('code', 'verification_email_mismatch');
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
    }

    public function test_verification_rechecks_the_current_address_after_authentication(): void
    {
        $user = $this->login();
        $link = $this->signedLink($user);
        $changed = false;
        Event::listen('eloquent.retrieved: '.User::class, function (User $loaded) use ($user, &$changed): void {
            if (! $changed && $loaded->is($user)) {
                $changed = true;
                // Simulate another session correcting the address after this user was loaded.
                DB::table('users')->where('id', $user->id)->update(['email' => 'corrected@example.com']);
            }
        });

        $this->browserRequest('POST', $link)->assertForbidden();
        $this->assertTrue($changed);
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        $this->assertSame('corrected@example.com', $user->email);
    }

    public function test_unverified_users_can_sign_in_to_resume_verification_and_sign_out(): void
    {
        $user = $this->login();
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.email_verified', false);
        $this->browserRequest('GET', '/api/user')->assertForbidden();
        Notification::assertNothingSent();
        $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $this->browserRequest('POST', $this->signedLink($user))->assertUnauthorized();
    }

    public function test_authenticated_users_cannot_register_or_switch_accounts_by_signing_in_again(): void
    {
        $user = $this->login();
        $this->browserRequest('POST', '/api/register', [...$this->registration(), 'email' => 'other@example.com'])->assertForbidden();
        $this->browserRequest('POST', '/api/login', ['email' => 'other@example.com', 'password' => 'a different long passphrase'])->assertForbidden();
        $this->assertDatabaseCount('users', 1);
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $user->id);
    }

    #[DataProvider('verificationMutations')]
    public function test_verification_mutations_require_authentication_and_csrf(string $method, string $path): void
    {
        $user = $this->createUser();
        $path = $path === 'verify' ? $this->signedLink($user) : $path;
        $this->browserRequest($method, $path, ['email' => 'corrected@example.com'])->assertUnauthorized();
        $this->login($user);
        $this->browserRequest($method, $path, ['email' => 'corrected@example.com'], csrf: false)->assertStatus(419);
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        $this->assertSame('alex@example.com', $user->email);
        Notification::assertNothingSent();
    }

    /** @return iterable<string, array{string, string}> */
    public static function verificationMutations(): iterable
    {
        yield 'verify' => ['POST', 'verify'];
        yield 'resend' => ['POST', '/api/email/verification-notification'];
        yield 'correct email' => ['PATCH', '/api/email'];
    }

    public function test_registration_requires_a_session_and_valid_csrf_token(): void
    {
        $this->browserRequest('POST', '/api/register', $this->registration(), csrf: false)->assertStatus(419);
        $this->withoutHeader('Origin');
        $this->browserRequest('POST', '/api/register', $this->registration())->assertForbidden();
        $this->assertDatabaseCount('users', 0);
        Notification::assertNothingSent();
    }

    public function test_untrusted_origins_cannot_manage_verification_with_existing_cookies(): void
    {
        $user = $this->login();
        $this->withHeader('Origin', 'https://untrusted.example');
        $this->browserRequest('GET', '/api/session')->assertUnauthorized();
        $this->browserRequest('POST', $this->signedLink($user))->assertUnauthorized();
        $this->browserRequest('POST', '/api/email/verification-notification')->assertUnauthorized();
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertUnauthorized();
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        Notification::assertNothingSent();
    }

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
        $other = $this->login($this->createUser('other@example.com'));
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertSentToTimes($other, VerifyEmail::class, 1);
        $this->assertSame('alex@example.com', $user->refresh()->email);
    }

    public function test_a_stale_correction_form_cannot_change_the_newly_signed_in_account(): void
    {
        $original = $this->login();
        $other = $this->createUser('other@example.com');
        $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->login($other);

        $this->browserRequest('PATCH', '/api/email', ['account_id' => $original->id, 'email' => 'wrong-account@example.com'])
            ->assertConflict()->assertJsonPath('code', 'account_context_changed');
        $this->assertSame('alex@example.com', $original->refresh()->email);
        $this->assertSame('other@example.com', $other->refresh()->email);
        Notification::assertNothingSent();

        $this->browserRequest('PATCH', '/api/email', ['account_id' => $other->id, 'email' => 'corrected@example.com'])->assertOk();
    }

    /** @param array<string, mixed> $data */
    #[DataProvider('invalidAccountContexts')]
    public function test_correction_requires_a_valid_account_context(array $data): void
    {
        $user = $this->login();
        $this->browserRequest('PATCH', '/api/email', [...$data, 'email' => 'corrected@example.com'])
            ->assertUnprocessable()->assertJsonValidationErrors('account_id');
        $this->assertSame('alex@example.com', $user->refresh()->email);
        Notification::assertNothingSent();
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function invalidAccountContexts(): iterable
    {
        yield 'missing' => [[]];
        yield 'zero' => [['account_id' => 0]];
        yield 'negative' => [['account_id' => -1]];
        yield 'array' => [['account_id' => [1]]];
        yield 'fraction' => [['account_id' => 1.5]];
    }

    public function test_invalid_corrections_do_not_consume_the_email_quota(): void
    {
        $user = $this->login();
        $this->createUser('taken@example.com');
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

    public function test_verified_users_cannot_change_their_address_using_the_correction_endpoint(): void
    {
        $user = $this->createUser();
        $user->markEmailAsVerified();
        $this->login($user);
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertForbidden();
        $this->assertSame('alex@example.com', $user->refresh()->email);
        $this->assertTrue($user->hasVerifiedEmail());
        Notification::assertNothingSent();
    }

    public function test_resending_for_an_already_verified_account_does_not_send_an_email(): void
    {
        $user = $this->createUser();
        $user->markEmailAsVerified();
        $this->login($user);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertNothingSent();
    }

    public function test_correcting_an_address_preserves_the_account_and_invalidates_the_old_address_link(): void
    {
        $user = $this->login();
        $oldLink = $this->signedLink($user);
        $password = $user->password;
        $this->browserRequest('PATCH', '/api/email', [
            'account_id' => $user->id,
            'email' => '  Corrected@EXAMPLE.COM  ',
            'id' => 999,
            'name' => 'Another Person',
            'password' => 'a different long passphrase',
            'email_verified_at' => now()->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.email', 'corrected@example.com')
            ->assertJsonPath('data.email_verified', false)->assertJsonPath('meta.verification_email_sent', true);

        $this->assertSame($password, $user->refresh()->password);
        $this->assertSame('Alex Example', $user->name);
        $this->assertDatabaseCount('users', 1);
        $this->browserRequest('POST', $oldLink)->assertForbidden();
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        $notification = Notification::sent($user, VerifyEmail::class)->sole();
        $this->assertInstanceOf(VerifyEmail::class, $notification);
        $link = $notification->toMail($user)->actionUrl;
        $this->browserRequest('POST', $this->apiLink($link))->assertNoContent();
        $this->assertTrue($user->refresh()->hasVerifiedEmail());
        $this->browserRequest('GET', '/api/user')->assertOk()->assertJsonPath('data.email', 'corrected@example.com');
    }

    /** @param array<string, mixed> $data */
    #[DataProvider('invalidCorrections')]
    public function test_invalid_email_corrections_preserve_the_account(array $data): void
    {
        $user = $this->login();
        $this->createUser('taken@example.com');
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, ...$data])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame('alex@example.com', $user->refresh()->email);
        Notification::assertNothingSent();
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function invalidCorrections(): iterable
    {
        yield 'missing' => [[]];
        yield 'blank' => [['email' => '   ']];
        yield 'null' => [['email' => null]];
        yield 'array' => [['email' => ['corrected@example.com']]];
        yield 'number' => [['email' => 123]];
        yield 'malformed' => [['email' => 'invalid']];
        yield 'too long' => [['email' => str_repeat('a', 255)]];
        yield 'already taken' => [['email' => ' TAKEN@EXAMPLE.COM ']];
    }

    public function test_a_duplicate_address_claimed_after_validation_returns_a_validation_error(): void
    {
        $user = $this->login();
        $claimed = false;
        $this->app->afterResolving(UpdateEmailRequest::class, function () use (&$claimed): void {
            if (! $claimed) {
                $claimed = true;
                $this->createUser('corrected@example.com');
            }
        });

        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame('alex@example.com', $user->refresh()->email);
        Notification::assertNothingSent();
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'available@example.com'])->assertOk();
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
    }

    public function test_address_correction_rechecks_verification_after_validation(): void
    {
        $user = $this->login();
        $this->app->afterResolving(UpdateEmailRequest::class, function () use ($user): void {
            $user->markEmailAsVerified();
        });

        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertForbidden();
        $this->assertTrue($user->refresh()->hasVerifiedEmail());
        $this->assertSame('alex@example.com', $user->email);
        Notification::assertNothingSent();
    }

    /** @param class-string<TransportException|HttpTransportException|LogicException> $exception */
    #[DataProvider('deliveryExceptions')]
    public function test_registration_delivery_failure_keeps_the_account_and_session_recoverable(string $exception): void
    {
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new $exception('Private provider diagnostic.'));
        $this->browserRequest('POST', '/api/register', $this->registration())
            ->assertCreated()->assertJsonPath('meta.verification_email_sent', false)
            ->assertDontSee('Private provider diagnostic.');
        $user = User::query()->sole();
        $this->assertFalse($user->hasVerifiedEmail());
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->browserRequest('GET', '/api/user')->assertForbidden();
        Exceptions::assertReported($exception);

        Notification::fake();
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
        $this->assertDatabaseCount('users', 1);
    }

    /** @return iterable<string, array{class-string<TransportException|HttpTransportException|LogicException>}> */
    public static function deliveryExceptions(): iterable
    {
        yield 'SMTP or provider failure' => [TransportException::class];
        yield 'HTTP connection failure' => [HttpTransportException::class];
        yield 'mail configuration failure' => [LogicException::class];
    }

    public function test_resend_failure_is_reported_without_claiming_that_email_was_sent(): void
    {
        $user = $this->login();
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new TransportException('Private provider diagnostic.'));
        $this->browserRequest('POST', '/api/email/verification-notification')
            ->assertServiceUnavailable()->assertHeader('Retry-After', '60')->assertExactJson([
                'message' => 'We could not send your verification email. Please try again later.',
                'code' => 'verification_email_unavailable',
            ]);
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        Exceptions::assertReported(TransportException::class);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
    }

    public function test_delivery_failure_after_email_correction_keeps_the_new_address_explicit_and_unverified(): void
    {
        $user = $this->login();
        $oldLink = $this->signedLink($user);
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new TransportException('Private provider diagnostic.'));
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])
            ->assertOk()->assertJsonPath('data.email', 'corrected@example.com')
            ->assertJsonPath('meta.verification_email_sent', false)->assertDontSee('Private provider diagnostic.');
        $this->assertSame('corrected@example.com', $user->refresh()->email);
        $this->assertFalse($user->hasVerifiedEmail());
        $this->browserRequest('POST', $oldLink)->assertForbidden();
        Exceptions::assertReported(TransportException::class);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
    }

    #[DataProvider('mailpitDeliveries')]
    public function test_a_real_verification_email_is_captured_by_mailpit_and_its_link_verifies_the_account(string $journey): void
    {
        Notification::swap(new ChannelManager($this->app));
        Config::set('mail.default', 'smtp');
        $testId = bin2hex(random_bytes(16));
        $email = "verification-{$testId}@example.test";
        if ($journey === 'correction') {
            $user = $this->login($this->createUser("typo-{$email}"));
            $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => $email])
                ->assertOk()->assertJsonPath('meta.verification_email_sent', true);
        } elseif ($journey === 'resend') {
            $this->login($this->createUser($email));
            $this->browserRequest('POST', '/api/email/verification-notification')
                ->assertNoContent()->assertHeader('Retry-After', '60');
        } else {
            $this->browserRequest('POST', '/api/register', [...$this->registration(), 'email' => $email])
                ->assertCreated()->assertJsonPath('meta.verification_email_sent', true);
        }
        $response = Http::timeout(5)->get('http://mailpit:8025/api/v1/search', ['query' => "to:{$email}"])->throw();
        $messages = $response->json('messages');
        $this->assertIsArray($messages);
        $this->assertCount(1, $messages);
        $message = reset($messages);
        $this->assertIsArray($message);
        $id = $message['ID'];
        $this->assertIsString($id);

        try {
            $captured = Http::timeout(5)->get("http://mailpit:8025/api/v1/message/{$id}")->throw();
            $this->assertSame($email, $captured->json('To.0.Address'));
            $this->assertSame('Verify your email | Caseward', $captured->json('Subject'));
            $html = $captured->json('HTML');
            $this->assertIsString($html);
            $this->assertStringContainsString('alt="Caseward"', $html);
            $this->assertStringContainsString('expires in 1 hour', $html);
            $this->assertSame(1, preg_match('/href="([^"]*\/email\/verify\/[^"]+)"/', $html, $matches));
            $matchedLink = $matches[1] ?? null;
            $this->assertIsString($matchedLink);
            $link = html_entity_decode($matchedLink, ENT_QUOTES | ENT_HTML5);
            $this->assertStringStartsWith('http://localhost:5173/email/verify/', $link);
            $this->assertStringNotContainsString('password', $link);
            $text = $captured->json('Text');
            $this->assertIsString($text);
            $this->assertStringContainsString($email, $text);
            $this->assertStringContainsString($link, $text);
            $this->assertStringNotContainsString('&amp;', $text);
            $this->browserRequest('POST', $this->apiLink($link))->assertNoContent();
            $this->assertTrue(User::query()->sole()->hasVerifiedEmail());
        } finally {
            Http::timeout(5)->delete('http://mailpit:8025/api/v1/messages', ['IDs' => [$id]])->throw();
        }
    }

    /** @return iterable<string, array{string}> */
    public static function mailpitDeliveries(): iterable
    {
        foreach (['registration', 'resend', 'correction'] as $journey) {
            yield $journey => [$journey];
        }
    }

    private function createUser(string $email = 'alex@example.com'): User
    {
        return User::query()->create(['name' => 'Alex Example', 'email' => $email, 'password' => 'correct horse battery staple']);
    }

    private function login(?User $user = null): User
    {
        $user ??= $this->createUser();
        $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => 'correct horse battery staple'])->assertNoContent();

        return $user;
    }

    private function signedLink(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1($user->email),
        ], absolute: false);
    }

    private function apiLink(string $frontendLink): string
    {
        $path = parse_url($frontendLink, PHP_URL_PATH);
        $query = parse_url($frontendLink, PHP_URL_QUERY);
        $this->assertIsString($path);
        $this->assertIsString($query);

        return "/api{$path}?{$query}";
    }

    /** @return array{name: string, email: string, password: string, password_confirmation: string} */
    private function registration(): array
    {
        return ['name' => 'Alex Example', 'email' => 'alex@example.com', 'password' => 'correct horse battery staple', 'password_confirmation' => 'correct horse battery staple'];
    }
}
