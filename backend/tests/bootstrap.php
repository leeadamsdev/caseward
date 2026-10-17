<?php

declare(strict_types=1);

use Illuminate\Contracts\Config\Repository;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Foundation\Bootstrap\LoadEnvironmentVariables;

require __DIR__.'/../vendor/autoload.php';

/** @var Application $app */
$app = require __DIR__.'/../bootstrap/app.php';
$app->bootstrapWith([LoadEnvironmentVariables::class, LoadConfiguration::class]);
$config = $app->make(Repository::class);

// Cached configuration takes precedence over PHPUnit's environment variables.
if (! $app->environment('testing')
    || $config->get('database.default') !== 'pgsql'
    || $config->get('database.connections.pgsql.database') !== 'caseward_testing'
    || $config->get('database.connections.pgsql.username') !== 'caseward_testing'
    || ! in_array($config->get('database.connections.pgsql.url'), [null, ''], true)
) {
    throw new LogicException('Refusing to run tests outside the isolated PostgreSQL test database. Clear cached configuration with php artisan config:clear.');
}

$redisPrefix = $config->get('database.redis.options.prefix');

if ($config->get('cache.limiter') !== 'redis'
    || $config->get('session.driver') !== 'redis'
    || $config->get('session.store') !== 'redis'
    || $config->get('session.connection') !== 'default'
    || $config->get('session.block_store') !== 'redis'
    || $config->get('database.redis.client') !== 'phpredis'
    || $config->get('database.redis.default.database') !== 1
    || $config->get('database.redis.default.username') !== 'caseward_testing'
    || ! is_string($redisPrefix)
    || ! str_starts_with($redisPrefix, 'caseward_testing:')
    || ! in_array($config->get('database.redis.default.url'), [null, ''], true)
) {
    throw new LogicException('Refusing to run tests outside the isolated Valkey test database. Clear cached configuration with php artisan config:clear.');
}
