<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use App\Http\Requests\UpdateEmailRequest;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class EmailCorrectionTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    public function test_a_stale_correction_form_cannot_change_the_newly_signed_in_account(): void
    {
        $original = $this->login();
        $other = UserFixture::create('other@example.com');
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

    public function test_verified_users_cannot_change_their_address_using_the_correction_endpoint(): void
    {
        $user = UserFixture::create();
        $user->markEmailAsVerified();
        $this->login($user);
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertForbidden();
        $this->assertSame('alex@example.com', $user->refresh()->email);
        $this->assertTrue($user->hasVerifiedEmail());
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
        UserFixture::create('taken@example.com');
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
                UserFixture::create('corrected@example.com');
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
}
