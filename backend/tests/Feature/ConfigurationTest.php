<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Config;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class ConfigurationTest extends TestCase
{
    #[DataProvider('unsafeConfigurations')]
    public function test_unsafe_cached_configuration_is_rejected_before_tests_start(string $key, string|int $value, string $service): void
    {
        $configuration = Config::all();
        Arr::set($configuration, $key, $value);

        $path = tempnam(storage_path('framework'), 'caseward-test-config-');

        if ($path === false) {
            throw new RuntimeException('Could not create the cached configuration fixture.');
        }

        try {
            $exportedConfiguration = var_export($configuration, true);
            file_put_contents($path, "<?php return {$exportedConfiguration};");

            $process = new Process(
                [PHP_BINARY, base_path('tests/bootstrap.php')],
                base_path(),
                ['APP_CONFIG_CACHE' => $path],
            );
            $process->run();

            $this->assertFalse($process->isSuccessful());
            $this->assertStringContainsString(
                "Refusing to run tests outside the isolated {$service} test database.",
                $process->getErrorOutput(),
            );
        } finally {
            unlink($path);
        }
    }

    /** @return iterable<string, array{string, string|int, string}> */
    public static function unsafeConfigurations(): iterable
    {
        yield 'development environment' => ['app.env', 'local', 'PostgreSQL'];
        yield 'wrong database driver' => ['database.default', 'sqlite', 'PostgreSQL'];
        yield 'development database' => ['database.connections.pgsql.database', 'caseward', 'PostgreSQL'];
        yield 'development database role' => ['database.connections.pgsql.username', 'caseward', 'PostgreSQL'];
        yield 'database URL override' => ['database.connections.pgsql.url', 'pgsql://caseward:caseward_local@postgres:5432/caseward', 'PostgreSQL'];
        yield 'in-memory limiter' => ['cache.limiter', 'array', 'Valkey'];
        yield 'wrong Redis client' => ['database.redis.client', 'predis', 'Valkey'];
        yield 'development Valkey database' => ['database.redis.default.database', 0, 'Valkey'];
        yield 'development Valkey user' => ['database.redis.default.username', 'caseward', 'Valkey'];
        yield 'development key prefix' => ['database.redis.options.prefix', 'caseward:', 'Valkey'];
        yield 'invalid key prefix' => ['database.redis.options.prefix', 123, 'Valkey'];
        yield 'Redis URL override' => ['database.redis.default.url', 'redis://caseward:caseward_local@valkey:6379/0', 'Valkey'];
    }
}
