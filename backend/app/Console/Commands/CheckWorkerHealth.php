<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\WorkerHeartbeat;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Queue;
use Throwable;

class CheckWorkerHealth extends Command
{
    protected $signature = 'queue:health';

    protected $description = 'Check worker progress and queue connectivity';

    public function handle(WorkerHeartbeat $heartbeat): int
    {
        if (! $heartbeat->healthy()) {
            $this->error('Worker heartbeat is missing or stale.');

            return self::FAILURE;
        }

        try {
            Queue::connection('redis')->size('default');
        } catch (Throwable) {
            $this->error('Queue is unavailable.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
