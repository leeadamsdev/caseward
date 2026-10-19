<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

class WorkerHeartbeat
{
    // Container-local: another worker must never mask a stalled process.
    public function __construct(private readonly string $path = '/tmp/caseward-worker-heartbeat') {}

    public function beat(): void
    {
        if (! touch($this->path)) {
            throw new RuntimeException('Cannot update the worker heartbeat.');
        }
    }

    public function healthy(): bool
    {
        clearstatcache(true, $this->path);

        // Allow the worker's 30-second job timeout plus scheduling headroom.
        return is_file($this->path) && time() - filemtime($this->path) <= 45;
    }

    public function forget(): void
    {
        if (is_file($this->path)) {
            unlink($this->path);
        }
    }
}
