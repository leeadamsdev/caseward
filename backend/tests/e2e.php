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

// Never use development credentials or external mail for browser integration tests.
if (! $app->environment('e2e')
    || $config->get('database.default') !== 'pgsql'
    || $config->get('database.connections.pgsql.host') !== 'postgres'
    || $config->get('database.connections.pgsql.database') !== 'caseward_testing'
    || $config->get('database.connections.pgsql.username') !== 'caseward_testing'
    || ! in_array($config->get('database.connections.pgsql.url'), [null, ''], true)
    || $config->get('cache.limiter') !== 'redis'
    || $config->get('session.driver') !== 'redis'
    || $config->get('database.redis.default.host') !== 'valkey'
    || $config->get('database.redis.default.database') !== 1
    || $config->get('database.redis.default.username') !== 'caseward_testing'
    || $config->get('database.redis.options.prefix') !== 'caseward_testing:e2e:'
    || ! in_array($config->get('database.redis.default.url'), [null, ''], true)
    || $config->get('queue.default') !== 'redis'
    || $config->get('queue.connections.redis.connection') !== 'default'
    || $config->get('cache.stores.passwords.connection') !== 'default'
    || $config->get('mail.default') !== 'smtp'
    || $config->get('mail.mailers.smtp.host') !== 'mailpit'
    || $config->get('mail.mailers.smtp.port') !== 1025
    || ! in_array($config->get('mail.mailers.brevo.key'), [null, ''], true)
) {
    throw new LogicException('Refusing to run browser integration tests outside the isolated E2E environment.');
}

echo "Isolated E2E configuration confirmed.\n";
