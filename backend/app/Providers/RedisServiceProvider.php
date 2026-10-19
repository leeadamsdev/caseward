<?php

declare(strict_types=1);

namespace App\Providers;

use App\Redis\CheckedPhpRedisConnector;
use Illuminate\Redis\RedisManager;
use Illuminate\Support\ServiceProvider;

class RedisServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->callAfterResolving('redis', function (RedisManager $manager): void {
            $manager->extend('phpredis', fn (): CheckedPhpRedisConnector => new CheckedPhpRedisConnector);
        });
    }
}
