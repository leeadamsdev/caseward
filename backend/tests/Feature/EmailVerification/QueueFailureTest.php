<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use App\Models\User;
use App\Notifications\VerificationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use RedisException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class QueueFailureTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    /** @param class-string<RedisException|LogicException> $exception */
    #[DataProvider('queueExceptions')]
    public function test_registration_queue_failure_keeps_the_account_and_session_recoverable(string $exception): void
    {
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new $exception('Private queue diagnostic.'));
        $this->browserRequest('POST', '/api/register', UserFixture::registration())
            ->assertCreated()->assertJsonPath('meta.verification_email_queued', false)
            ->assertDontSee('Private queue diagnostic.');
        $user = User::query()->sole();
        $this->assertFalse($user->hasVerifiedEmail());
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->browserRequest('GET', '/api/user')->assertForbidden();
        Exceptions::assertReported($exception);

        Notification::fake();
        $this->browserRequest('POST', '/api/email/verification-notification')->assertAccepted();
        Notification::assertSentToTimes($user, VerificationNotification::class, 1);
        $this->assertDatabaseCount('users', 1);
    }

    /** @return iterable<string, array{class-string<RedisException|LogicException>}> */
    public static function queueExceptions(): iterable
    {
        yield 'queue connection failure' => [RedisException::class];
        yield 'queue configuration failure' => [LogicException::class];
    }

    public function test_resend_failure_is_reported_without_claiming_that_email_was_queued(): void
    {
        $user = $this->login();
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new RedisException('Private queue diagnostic.'));
        $this->browserRequest('POST', '/api/email/verification-notification')
            ->assertServiceUnavailable()->assertHeader('Retry-After', '60')->assertExactJson([
                'message' => 'We could not queue your verification email. Please try again later.',
                'code' => 'verification_queue_unavailable',
            ]);
        $this->assertFalse($user->refresh()->hasVerifiedEmail());
        Exceptions::assertReported(RedisException::class);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
    }

    public function test_queue_failure_after_email_correction_keeps_the_new_address_explicit_and_unverified(): void
    {
        $user = $this->login();
        $oldLink = $this->signedLink($user);
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new RedisException('Private queue diagnostic.'));
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])
            ->assertOk()->assertJsonPath('data.email', 'corrected@example.com')
            ->assertJsonPath('meta.verification_email_queued', false)->assertDontSee('Private queue diagnostic.');
        $this->assertSame('corrected@example.com', $user->refresh()->email);
        $this->assertFalse($user->hasVerifiedEmail());
        $this->browserRequest('POST', $oldLink)->assertForbidden();
        Exceptions::assertReported(RedisException::class);
        $this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests();
    }
}
