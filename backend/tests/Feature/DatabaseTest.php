<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Symfony\Component\Process\Process;

class DatabaseTest extends TestCase
{
    #[DataProvider('unsafeConfigurations')]
    public function test_unsafe_cached_configuration_is_rejected_before_tests_start(string $key, string $value): void
    {
        $configuration = Config::all();
        Arr::set($configuration, $key, $value);

        $path = tempnam(storage_path('framework'), 'caseward-test-config-');

        if ($path === false) {
            throw new RuntimeException('Could not create the cached configuration fixture.');
        }

        try {
            file_put_contents($path, '<?php return '.var_export($configuration, true).';');

            $process = new Process(
                [PHP_BINARY, base_path('tests/bootstrap.php')],
                base_path(),
                ['APP_CONFIG_CACHE' => 'storage/framework/'.basename($path)],
            );
            $process->run();

            $this->assertFalse($process->isSuccessful());
            $this->assertStringContainsString(
                'Refusing to run tests outside the isolated PostgreSQL test database.',
                $process->getErrorOutput(),
            );
        } finally {
            unlink($path);
        }
    }

    /** @return iterable<string, array{string, string}> */
    public static function unsafeConfigurations(): iterable
    {
        yield 'development environment' => ['app.env', 'local'];
        yield 'wrong driver' => ['database.default', 'sqlite'];
        yield 'development database' => ['database.connections.pgsql.database', 'caseward'];
        yield 'development role' => ['database.connections.pgsql.username', 'caseward'];
        yield 'URL override' => ['database.connections.pgsql.url', 'pgsql://caseward:caseward_local@postgres:5432/caseward'];
    }

    public function test_postgresql_connects_to_the_test_database(): void
    {
        $this->assertSame('caseward_testing', DB::scalar('SELECT current_database()'));
    }

    public function test_the_test_role_cannot_connect_to_the_development_database(): void
    {
        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('permission denied for database "caseward"');

        DB::build([
            ...Config::array('database.connections.pgsql'),
            'database' => 'caseward',
        ])->selectOne('SELECT 1');
    }
}
