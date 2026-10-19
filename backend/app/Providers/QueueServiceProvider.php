<?php

declare(strict_types=1);

namespace App\Providers;

use App\Support\WorkerHeartbeat;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\Events\WorkerStopping;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class QueueServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Event::listen(Looping::class, [WorkerHeartbeat::class, 'beat']);
        Event::listen(WorkerStopping::class, [WorkerHeartbeat::class, 'forget']);
    }
}
