<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces\Invitations;

use App\Actions\WorkspaceInvitations;
use App\Models\WorkspaceInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Queue\Worker;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithMail;
use Tests\Concerns\InteractsWithQueue;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class InvitationQueueTest extends TestCase
{
    use InteractsWithMail;
    use InteractsWithQueue;
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::swap(new ChannelManager($this->app));
    }

    public function test_invitation_delivery_is_queued_encrypted_and_contains_a_working_recipient_bound_token(): void
    {
        $owner = $this->user();
        $recipient = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        $this->browserRequest('POST', "/api/workspaces/{$workspace->id}/invitations", ['account_id' => $owner->id, 'email' => $recipient->email])->assertCreated();
        $this->assertCount(0, $this->arrayTransport()->messages());
        $job = $this->queue()->pop();
        $this->assertNotNull($job);
        $this->assertStringNotContainsString($recipient->email, $job->getRawBody());
        $this->assertStringNotContainsString(WorkspaceInvitation::query()->sole()->id, $job->getRawBody());
        $job->fire();
        $message = $this->sentEmail();
        $this->assertSame($recipient->email, $message->getTo()[0]->getAddress());
        $this->assertSame('Workspace invitation | Caseward', $message->getSubject());
        $text = $message->getTextBody();
        $this->assertIsString($text);
        $this->assertSame(1, preg_match('~/invitations/([a-f0-9]{64})~', $text, $matches));
        $token = $matches[1] ?? null;
        $this->assertIsString($token);
        $this->assertStringNotContainsString($token, $job->getRawBody());
        $this->assertSame(hash('sha256', $token), WorkspaceInvitation::query()->sole()->token_hash);
        $this->signIn($recipient);
        $this->browserRequest('GET', "/api/invitations/{$token}")->assertOk();
        $this->browserRequest('POST', "/api/invitations/{$token}/accept", ['account_id' => $recipient->id])->assertOk()->assertJsonPath('data.role', 'member');
    }

    /** @param 'rotated'|'expired'|'accepted'|'revoked'|'deleted workspace' $change */
    #[DataProvider('obsoleteInvitations')]
    public function test_obsolete_jobs_do_not_deliver(string $change): void
    {
        $owner = $this->user();
        $recipient = $this->user();
        $workspace = $this->workspace($owner);
        $invitation = $this->app->make(WorkspaceInvitations::class)->create($owner, $workspace->id, $recipient->email);
        match ($change) {
            'rotated' => $invitation->update(['token_hash' => str_repeat('f', 64)]),
            'expired' => $invitation->update(['expires_at' => now()]),
            'accepted' => $invitation->update(['accepted_at' => now()]),
            'revoked' => $invitation->update(['revoked_at' => now()]),
            'deleted workspace' => $workspace->delete(),
        };
        $this->processDelivery();
        $this->assertCount(0, $this->arrayTransport()->messages());
    }

    /** @return iterable<string, array{string}> */
    public static function obsoleteInvitations(): iterable
    {
        foreach (['rotated', 'expired', 'accepted', 'revoked', 'deleted workspace'] as $change) {
            yield $change => [$change];
        }
    }

    public function test_worker_retries_provider_failure_without_blocking_the_request(): void
    {
        Exceptions::fake();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', '127.0.0.1');
        Config::set('mail.mailers.smtp.port', 1);
        $this->app->make(WorkspaceInvitations::class)->create($owner, $workspace->id, 'new@example.com');
        Exceptions::assertNothingReported();
        $worker = $this->app->make('queue.worker');
        $this->assertInstanceOf(Worker::class, $worker);
        $options = new WorkerOptions(backoff: 0, sleep: 0, maxTries: 3);
        $worker->runNextJob('redis', 'default', $options);
        Exceptions::assertReportedCount(1);
        $this->assertSame(1, $this->queue()->delayedSize());
        Config::set('mail.default', 'array');
        $worker->runNextJob('redis', 'default', $options);
        $this->assertSame('new@example.com', $this->sentEmail()->getTo()[0]->getAddress());
        $this->assertSame(0, $this->queue()->size());
    }
}
