<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Contracts\Config\Repository;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as LaravelTestCase;

abstract class TestCase extends LaravelTestCase
{
    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $testId = bin2hex(random_bytes(16));

        // Expiring Valkey keys stay isolated without flushing shared state.
        $app->make(Repository::class)->set(
            'database.redis.options.prefix',
            "caseward_testing:{$testId}:",
        );

        return $app;
    }
}
