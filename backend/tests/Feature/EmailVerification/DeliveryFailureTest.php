<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpClient\Exception\TransportException as HttpTransportException;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class DeliveryFailureTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    /** @param class-string<TransportException|HttpTransportException|LogicException> $exception */
    #[DataProvider('deliveryExceptions')]
    public function test_registration_delivery_failure_keeps_the_account_and_session_recoverable(string $exception): void
    {
        Exceptions::fake();
        Notification::shouldReceive('send')->once()->andThrow(new $exception('Private provider diagnostic.'));
        $this->browserRequest('POST', '/api/register', UserFixture::registration())
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
}
