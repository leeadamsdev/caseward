<?php

declare(strict_types=1);

namespace Tests\Feature\PasswordRecovery;

use App\Actions\RecoverPassword;
use App\Jobs\RequestPasswordReset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Worker;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\InteractsWithMail;
use Tests\Concerns\InteractsWithQueue;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class RecoveryQueueTest extends TestCase
{
    use InteractsWithMail;
    use InteractsWithQueue;
    use RefreshDatabase;

    public function test_real_queue_processing_keeps_email_and_tokens_encrypted_and_builds_a_trusted_frontend_link(): void
    {
        $user = UserFixture::create(email: 'alex+test@example.com');
        Queue::push(new RequestPasswordReset($user->email));
        $requestJob = $this->queue()->pop();
        $this->assertNotNull($requestJob);
        $this->assertStringNotContainsString($user->email, $requestJob->getRawBody());
        $requestJob->fire();
        $this->assertCount(0, $this->arrayTransport()->messages());

        $deliveryJob = $this->queue()->pop();
        $this->assertNotNull($deliveryJob);
        $raw = $deliveryJob->getRawBody();
        $this->assertStringNotContainsString($user->email, $raw);
        $this->assertStringNotContainsString('s:5:"token"', $raw);
        $deliveryJob->fire();
        $this->assertSame(0, $this->queue()->size());

        $message = $this->sentEmail();
        $html = $message->getHtmlBody();
        $this->assertIsString($html);
        $this->assertSame(1, preg_match('/http:\/\/localhost:5173\/reset-password\/([a-f0-9]{64})\?email=alex%2Btest%40example.com/', $html, $matches));
        $token = $matches[1] ?? null;
        $this->assertIsString($token);
        $this->assertStringNotContainsString($token, $raw);
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->assertSame('alex+test@example.com', $message->getTo()[0]->getAddress());
        $this->assertStringContainsString('30 minutes', $html);
        $this->assertSame('Reset your password | Caseward', $message->getSubject());
        $this->assertStringContainsString('alt="Caseward"', $html);
        $text = $message->getTextBody();
        $this->assertIsString($text);
        $this->assertStringContainsString($token, $text);
    }

    public function test_delivery_failure_is_retried_with_the_same_token_instead_of_creating_another_link(): void
    {
        Exceptions::fake();
        $user = UserFixture::create(email: 'alex+test@example.com');
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $before = Cache::store('passwords')->get(hash('sha256', $user->email));
        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', '127.0.0.1');
        Config::set('mail.mailers.smtp.port', 1);
        $options = new WorkerOptions(backoff: 0, sleep: 0, maxTries: 3);
        $worker = $this->app->make('queue.worker');
        $this->assertInstanceOf(Worker::class, $worker);

        $worker->runNextJob('redis', 'default', $options);
        $this->assertSame(1, $this->queue()->delayedSize());
        $this->assertSame($before, Cache::store('passwords')->get(hash('sha256', $user->email)));
        Config::set('mail.default', 'array');
        $worker->runNextJob('redis', 'default', $options);

        $this->assertSame(0, $this->queue()->size());
        $this->assertCount(1, $this->arrayTransport()->messages());
        $this->assertSame($before, Cache::store('passwords')->get(hash('sha256', $user->email)));
    }

    public function test_exhausted_deliveries_stop_retrying_and_report_failure(): void
    {
        Exceptions::fake();
        $user = UserFixture::create(email: 'alex+test@example.com');
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', '127.0.0.1');
        Config::set('mail.mailers.smtp.port', 1);
        $options = new WorkerOptions(backoff: 0, sleep: 0, maxTries: 3);
        $worker = $this->app->make('queue.worker');
        $this->assertInstanceOf(Worker::class, $worker);

        for ($i = 0; $i < 3; $i++) {
            $worker->runNextJob('redis', 'default', $options);
        }
        $this->assertSame(0, $this->queue()->size());
        Exceptions::assertReportedCount(3);
    }

    public function test_a_new_request_invalidates_a_queued_older_email_before_delivery(): void
    {
        $this->freezeTime();
        $user = UserFixture::create(email: 'alex+test@example.com');
        $recovery = $this->app->make(RecoverPassword::class);
        $recovery->sendLink($user->email);
        $this->travel(61)->seconds();
        $recovery->sendLink($user->email);

        $this->processDelivery();
        $this->assertCount(0, $this->arrayTransport()->messages());
        $this->processDelivery();
        $this->assertCount(1, $this->arrayTransport()->messages());
    }

    public function test_expired_and_corrected_addresses_do_not_receive_queued_reset_links(): void
    {
        $this->freezeTime();
        $user = UserFixture::create(email: 'alex+test@example.com');
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $user->update(['email' => 'corrected@example.com']);
        $this->processDelivery();
        $this->assertCount(0, $this->arrayTransport()->messages());

        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $this->travel(31)->minutes();
        $this->processDelivery();
        $this->assertCount(0, $this->arrayTransport()->messages());
    }

    public function test_password_changes_only_after_a_valid_reset_and_consumed_tokens_are_rejected(): void
    {
        $user = UserFixture::create(email: 'alex+test@example.com');
        $recovery = $this->app->make(RecoverPassword::class);
        $recovery->sendLink($user->email);
        $before = $user->password;
        $this->processDelivery();
        $this->assertSame($before, $user->refresh()->password);
        $html = $this->sentEmail()->getHtmlBody();
        $this->assertIsString($html);
        $this->assertSame(1, preg_match('/reset-password\/([a-f0-9]{64})/', $html, $matches));
        $token = $matches[1] ?? null;
        $this->assertIsString($token);

        $this->assertTrue($recovery->reset($user->email, $token, 'a new sufficiently long password'));
        $this->assertTrue(Hash::check('a new sufficiently long password', $user->refresh()->password));
        $this->assertFalse(Password::tokenExists($user, $token));
    }

    public function test_confirmation_is_encrypted_and_preserves_the_recipient_and_reset_time_during_delays(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 18)->setTime(15, 45)->utc());
        $user = UserFixture::create(email: 'alex+test@example.com');
        $email = $user->email;
        $token = Password::createToken($user);
        $password = 'a new sufficiently long password';
        $recovery = $this->app->make(RecoverPassword::class);
        $this->assertTrue($recovery->reset($email, $token, $password));
        $this->assertFalse($recovery->reset($email, $token, $password));
        $hash = $user->refresh()->password;
        $this->assertSame(1, $this->queue()->size());
        $this->assertCount(0, $this->arrayTransport()->messages());
        $user->update(['email' => 'corrected@example.com']);
        $this->travel(2)->hours();

        $job = $this->queue()->pop();
        $this->assertNotNull($job);
        foreach ([$email, $token, $password, $hash] as $secret) {
            $this->assertStringNotContainsString($secret, $job->getRawBody());
        }
        $job->fire();
        $message = $this->sentEmail();
        $this->assertSame($email, $message->getTo()[0]->getAddress());
        $this->assertSame('Your password was reset | Caseward', $message->getSubject());
        foreach ([$message->getHtmlBody(), $message->getTextBody()] as $body) {
            $this->assertIsString($body);
            $this->assertStringContainsString('18 October 2026 at 15:45 UTC', $body);
            $this->assertStringContainsString('http://localhost:5173/forgot-password', $body);
            foreach ([$user->email, $token, $password, $hash] as $secret) {
                $this->assertStringNotContainsString($secret, $body);
            }
        }
        $this->assertEmpty($message->getAttachments());
        $this->assertSame(0, $this->queue()->size());
    }

    public function test_confirmation_delivery_retries_without_changing_the_completed_reset(): void
    {
        Exceptions::fake();
        $user = UserFixture::create(email: 'alex+test@example.com');
        $token = Password::createToken($user);
        $this->assertTrue($this->app->make(RecoverPassword::class)->reset($user->email, $token, 'a new sufficiently long password'));
        $hash = $user->refresh()->password;
        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', '127.0.0.1');
        Config::set('mail.mailers.smtp.port', 1);
        $options = new WorkerOptions(backoff: 0, sleep: 0, maxTries: 3);
        $worker = $this->app->make('queue.worker');
        $this->assertInstanceOf(Worker::class, $worker);

        $worker->runNextJob('redis', 'default', $options);
        $this->assertSame(1, $this->queue()->delayedSize());
        Exceptions::assertReportedCount(1);
        Config::set('mail.default', 'array');
        $worker->runNextJob('redis', 'default', $options);

        $this->assertSame(0, $this->queue()->size());
        $this->assertSame($hash, $user->refresh()->password);
        $this->assertFalse(Password::tokenExists($user, $token));
        $this->assertSame('Your password was reset | Caseward', $this->sentEmail()->getSubject());
    }
}
