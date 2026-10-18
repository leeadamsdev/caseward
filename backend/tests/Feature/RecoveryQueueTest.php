<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Actions\RecoverPassword;
use App\Jobs\RequestPasswordReset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailer;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Queue\RedisQueue;
use Illuminate\Queue\Worker;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

class RecoveryQueueTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('queue.connections.redis.after_commit', false);
    }

    protected function tearDown(): void
    {
        Redis::del('queues:default', 'queues:default:notify', 'queues:default:reserved', 'queues:default:delayed');
        parent::tearDown();
    }

    public function test_real_queue_processing_keeps_email_and_tokens_encrypted_and_builds_a_trusted_frontend_link(): void
    {
        $user = $this->user();
        Queue::push(new RequestPasswordReset($user->email));
        $requestJob = $this->queue()->pop();
        $this->assertNotNull($requestJob);
        $this->assertStringNotContainsString($user->email, $requestJob->getRawBody());
        $requestJob->fire();
        $this->assertCount(0, $this->transport()->messages());

        $deliveryJob = $this->queue()->pop();
        $this->assertNotNull($deliveryJob);
        $raw = $deliveryJob->getRawBody();
        $this->assertStringNotContainsString($user->email, $raw);
        $this->assertStringNotContainsString('s:5:"token"', $raw);
        $deliveryJob->fire();
        $this->assertSame(0, $this->queue()->size());

        $message = $this->email();
        $html = $message->getHtmlBody();
        $this->assertIsString($html);
        $this->assertSame(1, preg_match('/http:\/\/localhost:5173\/reset-password\/([a-f0-9]{64})\?email=alex%2Btest%40example.com/', $html, $matches));
        $token = $matches[1] ?? null;
        $this->assertIsString($token);
        $this->assertStringNotContainsString($token, $raw);
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->assertSame('alex+test@example.com', $message->getTo()[0]->getAddress());
        $this->assertStringContainsString('30 minutes', $html);
    }

    public function test_delivery_failure_is_retried_with_the_same_token_instead_of_creating_another_link(): void
    {
        Exceptions::fake();
        $user = $this->user();
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
        $this->assertCount(1, $this->transport()->messages());
        $this->assertSame($before, Cache::store('passwords')->get(hash('sha256', $user->email)));
    }

    public function test_exhausted_deliveries_stop_retrying_and_report_failure(): void
    {
        Exceptions::fake();
        $user = $this->user();
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
        $user = $this->user();
        $recovery = $this->app->make(RecoverPassword::class);
        $recovery->sendLink($user->email);
        $this->travel(61)->seconds();
        $recovery->sendLink($user->email);

        $this->processDelivery();
        $this->assertCount(0, $this->transport()->messages());
        $this->processDelivery();
        $this->assertCount(1, $this->transport()->messages());
    }

    public function test_expired_and_corrected_addresses_do_not_receive_queued_reset_links(): void
    {
        $this->freezeTime();
        $user = $this->user();
        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $user->update(['email' => 'corrected@example.com']);
        $this->processDelivery();
        $this->assertCount(0, $this->transport()->messages());

        $this->app->make(RecoverPassword::class)->sendLink($user->email);
        $this->travel(31)->minutes();
        $this->processDelivery();
        $this->assertCount(0, $this->transport()->messages());
    }

    public function test_password_changes_only_after_a_valid_reset_and_consumed_tokens_are_rejected(): void
    {
        $user = $this->user();
        $recovery = $this->app->make(RecoverPassword::class);
        $recovery->sendLink($user->email);
        $before = $user->password;
        $this->processDelivery();
        $this->assertSame($before, $user->refresh()->password);
        $html = $this->email()->getHtmlBody();
        $this->assertIsString($html);
        $this->assertSame(1, preg_match('/reset-password\/([a-f0-9]{64})/', $html, $matches));
        $token = $matches[1] ?? null;
        $this->assertIsString($token);

        $this->assertTrue($recovery->reset($user->email, $token, 'a new sufficiently long password'));
        $this->assertTrue(Hash::check('a new sufficiently long password', $user->refresh()->password));
        $this->assertFalse(Password::tokenExists($user, $token));
    }

    private function user(): User
    {
        return User::query()->create(['name' => 'Alex Example', 'email' => 'alex+test@example.com', 'password' => 'correct horse battery staple']);
    }

    private function queue(): RedisQueue
    {
        $queue = Queue::connection('redis');
        $this->assertInstanceOf(RedisQueue::class, $queue);

        return $queue;
    }

    private function processDelivery(): void
    {
        $job = $this->queue()->pop();
        $this->assertNotNull($job);
        $job->fire();
    }

    private function transport(): ArrayTransport
    {
        $mailer = Mail::mailer('array');
        $this->assertInstanceOf(Mailer::class, $mailer);
        $transport = $mailer->getSymfonyTransport();
        $this->assertInstanceOf(ArrayTransport::class, $transport);

        return $transport;
    }

    private function email(): Email
    {
        $sent = $this->transport()->messages()->sole();
        $this->assertInstanceOf(SentMessage::class, $sent);
        $message = $sent->getOriginalMessage();
        $this->assertInstanceOf(Email::class, $message);

        return $message;
    }
}
