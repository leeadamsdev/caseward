<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class VerificationTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    public function test_registration_sends_an_expiring_frontend_link_and_establishes_a_restricted_session(): void
    {
        $oldCookies = $this->cookies;
        $oldToken = $this->cookies['XSRF-TOKEN'];
        $this->browserRequest('POST', '/api/register', UserFixture::registration())
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
        $other = UserFixture::create('other@example.com');
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
        $this->browserRequest('POST', '/api/register', [...UserFixture::registration(), 'email' => 'other@example.com'])->assertForbidden();
        $this->browserRequest('POST', '/api/login', ['email' => 'other@example.com', 'password' => 'a different long passphrase'])->assertForbidden();
        $this->assertDatabaseCount('users', 1);
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $user->id);
    }

    #[DataProvider('verificationMutations')]
    public function test_verification_mutations_require_authentication_and_csrf(string $method, string $path): void
    {
        $user = UserFixture::create();
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
        $this->browserRequest('POST', '/api/register', UserFixture::registration(), csrf: false)->assertStatus(419);
        $this->withoutHeader('Origin');
        $this->browserRequest('POST', '/api/register', UserFixture::registration())->assertForbidden();
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

    public function test_resending_for_an_already_verified_account_does_not_send_an_email(): void
    {
        $user = UserFixture::create();
        $user->markEmailAsVerified();
        $this->login($user);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent();
        Notification::assertNothingSent();
    }
}
