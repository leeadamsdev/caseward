<?php

declare(strict_types=1);

namespace Tests\Concerns;

use Illuminate\Queue\RedisQueue;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;

trait InteractsWithQueue
{
    protected function setUpInteractsWithQueue(): void
    {
        // Process real jobs inside RefreshDatabase's rollback transaction.
        Config::set('queue.connections.redis.after_commit', false);
    }

    protected function tearDownInteractsWithQueue(): void
    {
        Redis::del('queues:default', 'queues:default:notify', 'queues:default:reserved', 'queues:default:delayed');
    }

    protected function queue(): RedisQueue
    {
        $queue = Queue::connection('redis');
        $this->assertInstanceOf(RedisQueue::class, $queue);

        return $queue;
    }

    protected function processDelivery(): void
    {
        $job = $this->queue()->pop();
        $this->assertNotNull($job);
        $job->fire();
    }
}
