<?php

declare(strict_types=1);

namespace App\Session;

use Illuminate\Session\CacheBasedSessionHandler;

class CacheSessionHandler extends CacheBasedSessionHandler
{
    private ?int $lifetime = null;

    public function setLifetime(int $seconds): void
    {
        $this->lifetime = $seconds;
    }

    public function write($sessionId, $data): bool
    {
        return $this->cache->put($sessionId, $data, $this->lifetime ?? $this->minutes * 60);
    }
}
