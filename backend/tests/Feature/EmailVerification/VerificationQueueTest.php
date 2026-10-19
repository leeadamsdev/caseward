<?php

declare(strict_types=1);

namespace Tests\Feature\EmailVerification;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Queue\Worker;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Concerns\InteractsWithMail;
use Tests\Concerns\InteractsWithQueue;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class VerificationQueueTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use InteractsWithMail;
    use InteractsWithQueue;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::swap(new ChannelManager($this->app));
    }

    public function test_registration_queues_an_encrypted_notification_without_delivering_during_the_request(): void
    {
        $this->browserRequest('POST', '/api/register', UserFixture::registration())
            ->assertCreated()->assertJsonPath('meta.verification_email_queued', true);
        $this->assertCount(0, $this->arrayTransport()->messages());
        $job = $this->queue()->pop();
        $this->assertNotNull($job);
        $user = User::query()->sole();
        $this->assertStringNotContainsString($user->email, $job->getRawBody());
        $this->assertStringNotContainsString($user->password, $job->getRawBody());

        $job->fire();
        $message = $this->sentEmail();
        $this->assertSame($user->email, $message->getTo()[0]->getAddress());
        $this->assertSame('Verify your email | Caseward', $message->getSubject());
    }

    public function test_provider_failure_does_not_block_resend_and_the_worker_retries_delivery(): void
    {
        Exceptions::fake();
        $user = $this->login();
        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', '127.0.0.1');
        Config::set('mail.mailers.smtp.port', 1);

        $this->browserRequest('POST', '/api/email/verification-notification')
            ->assertAccepted()->assertExactJson(['message' => 'Verification email queued.'])->assertHeader('Retry-After', '60');
        Exceptions::assertNothingReported();
        $this->browserRequest('GET', '/api/session')->assertOk()->assertJsonPath('data.id', $user->id);
        $worker = $this->app->make('queue.worker');
        $this->assertInstanceOf(Worker::class, $worker);
        $options = new WorkerOptions(backoff: 0, sleep: 0, maxTries: 3);
        $worker->runNextJob('redis', 'default', $options);
        Exceptions::assertReportedCount(1);
        $this->assertSame(1, $this->queue()->delayedSize());
        Config::set('mail.default', 'array');
        $worker->runNextJob('redis', 'default', $options);
        $this->assertSame(0, $this->queue()->size());
        $this->assertSame($user->email, $this->sentEmail()->getTo()[0]->getAddress());
    }

    /** @param 'corrected'|'verified'|'deleted' $change */
    #[DataProvider('obsoleteAccounts')]
    public function test_obsolete_queued_messages_are_discarded_without_delivery(string $change): void
    {
        $user = UserFixture::create();
        $user->sendEmailVerificationNotification();
        match ($change) {
            'corrected' => $user->update(['email' => 'corrected@example.test']),
            'verified' => $user->markEmailAsVerified(),
            'deleted' => $user->delete(),
        };
        $this->processDelivery();
        $this->assertSame(0, $this->queue()->size());
        $this->assertCount(0, $this->arrayTransport()->messages());
    }

    /** @return iterable<string, array{'corrected'|'verified'|'deleted'}> */
    public static function obsoleteAccounts(): iterable
    {
        foreach (['corrected', 'verified', 'deleted'] as $change) {
            yield $change => [$change];
        }
    }

    public function test_correction_sends_only_to_the_new_address_and_builds_its_link_at_delivery_time(): void
    {
        $this->freezeTime();
        $user = $this->login();
        $user->sendEmailVerificationNotification();
        $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.test'])
            ->assertOk()->assertJsonPath('meta.verification_email_queued', true);
        $this->processDelivery();
        $this->assertCount(0, $this->arrayTransport()->messages());
        $this->travel(2)->hours();
        $this->processDelivery();
        $this->assertSame('corrected@example.test', $this->sentEmail()->getTo()[0]->getAddress());
        $html = $this->sentEmail()->getHtmlBody();
        $this->assertIsString($html);
        $this->assertStringContainsString('expires='.now()->addHour()->timestamp, $html);
        $this->assertStringContainsString(sha1('corrected@example.test'), $html);
    }
}
