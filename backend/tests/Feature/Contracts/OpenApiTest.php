<?php

declare(strict_types=1);

namespace Tests\Feature\Contracts;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use stdClass;
use Tests\Support\ApiContract;
use Tests\TestCase;

class OpenApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_is_current_complete_and_has_no_unknown_types(): void
    {
        $this->assertSame(0, Artisan::call('scramble:export', ['--stdout' => true, '--fail-on-unknown' => true]));
        $this->assertJsonStringEqualsJsonFile(base_path('openapi.json'), Artisan::output(), 'Regenerate the contract with composer openapi:export.');
    }

    public function test_documentation_is_available_locally_and_forbidden_in_production(): void
    {
        $this->app->instance('env', 'local');
        $this->get('/docs/api')->assertOk();
        $this->app->instance('env', 'production');
        $this->getJson('/docs/api')->assertForbidden();
        $this->getJson('/docs/api.json')->assertForbidden();
    }

    public function test_every_api_operation_has_a_unique_id_and_explicit_browser_security(): void
    {
        $document = (new ApiContract)->document;
        $this->assertInstanceOf(stdClass::class, $document->paths);
        $actual = $ids = [];
        foreach (get_object_vars($document->paths) as $path => $methods) {
            $this->assertInstanceOf(stdClass::class, $methods);
            foreach (get_object_vars($methods) as $method => $operation) {
                $this->assertInstanceOf(stdClass::class, $operation);
                $this->assertIsString($operation->operationId);
                $this->assertNotSame('', $operation->operationId);
                $ids[] = $operation->operationId;
                $actual[] = strtoupper($method)." {$path}";
                $this->assertIsArray($operation->security);
                $expected = $path === '/sanctum/csrf-cookie' ? [] : [
                    in_array($method, ['get', 'head', 'options'], true)
                        ? (object) ['session' => []]
                        : (object) ['session' => [], 'csrf' => []],
                ];
                $this->assertEquals($expected, $operation->security);
            }
        }
        $this->assertSame($ids, array_unique($ids), 'Operation IDs must be unique for code generation.');

        $expected = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/') && $route->uri() !== 'sanctum/csrf-cookie') {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $expected[] = "{$method} /{$route->uri()}";
            }
        }
        $this->assertEqualsCanonicalizing($expected, $actual, 'The contract must include every browser API operation.');
        $this->assertEquals([(object) ['url' => '/']], $document->servers);
    }
}
