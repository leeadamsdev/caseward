<?php

declare(strict_types=1);

namespace Tests\Feature\Infrastructure;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DatabaseTest extends TestCase
{
    public function test_postgresql_connects_to_the_test_database(): void
    {
        $this->assertSame('caseward_testing', DB::scalar('SELECT current_database()'));
    }

    public function test_the_test_role_cannot_connect_to_the_development_database(): void
    {
        $this->expectException(QueryException::class);
        $this->expectExceptionMessageIsOrContains('permission denied for database "caseward"');

        DB::build([
            ...Config::array('database.connections.pgsql'),
            'database' => 'caseward',
        ])->selectOne('SELECT 1');
    }
}
