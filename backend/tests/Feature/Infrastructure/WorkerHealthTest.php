<?php

declare(strict_types=1);

namespace Tests\Feature\Infrastructure;

use App\Support\WorkerHeartbeat;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\Events\WorkerStopping;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\PendingCommand;
use RuntimeException;
use Tests\TestCase;

class WorkerHealthTest extends TestCase
{
    private WorkerHeartbeat $heartbeat;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        $this->path = sys_get_temp_dir().'/caseward-worker-test-'.bin2hex(random_bytes(16));
        $this->heartbeat = new WorkerHeartbeat($this->path);
        $this->app->instance(WorkerHeartbeat::class, $this->heartbeat);
    }

    protected function tearDown(): void
    {
        $this->heartbeat->forget();
        parent::tearDown();
    }

    public function test_an_accessible_queue_alone_does_not_make_a_worker_healthy(): void
    {
        Queue::shouldReceive('connection')->never();
        $this->checkHealth()->assertFailed();
    }

    public function test_worker_loop_events_refresh_health_and_stopping_clears_it(): void
    {
        Event::dispatch(new Looping('redis', 'default', new WorkerOptions));
        $this->checkHealth()->assertSuccessful();

        // A normal job can run for 30 seconds without generating another loop event.
        touch($this->path, time() - 35);
        $this->checkHealth()->assertSuccessful();
        touch($this->path, time() - 46);
        $this->checkHealth()->assertFailed();

        Event::dispatch(new Looping('redis', 'default', new WorkerOptions));
        $this->checkHealth()->assertSuccessful();
        Event::dispatch(new WorkerStopping(0));
        $this->checkHealth()->assertFailed();
    }

    public function test_a_fresh_heartbeat_does_not_mask_an_unavailable_queue(): void
    {
        $this->heartbeat->beat();
        Queue::shouldReceive('connection')->with('redis')->once()->andThrow(new RuntimeException('Private connection details.'));
        $this->checkHealth()->expectsOutput('Queue is unavailable.')->assertFailed();
    }

    public function test_a_fresh_heartbeat_does_not_mask_an_unreadable_worker_pause_state(): void
    {
        $this->heartbeat->beat();
        Queue::shouldReceive('connection')->with('redis')->once()->andReturnSelf();
        Queue::shouldReceive('size')->with('default')->once()->andReturn(0);
        Queue::shouldReceive('getPausedQueues')->with('redis', ['default'])->once()->andThrow(new RuntimeException('Private cache details.'));
        $this->checkHealth()->expectsOutput('Queue is unavailable.')->assertFailed();
    }

    public function test_independent_worker_heartbeats_do_not_mask_each_other(): void
    {
        $other = new WorkerHeartbeat($this->path.'-other');
        try {
            $other->beat();
            $this->assertTrue($other->healthy());
            $this->assertFalse($this->heartbeat->healthy());
        } finally {
            $other->forget();
        }
    }

    private function checkHealth(): PendingCommand
    {
        $command = $this->artisan('queue:health');
        $this->assertInstanceOf(PendingCommand::class, $command);

        return $command;
    }
}
