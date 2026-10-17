<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Sleep;
use Redis as PhpRedis;
use RedisException;
use Tests\TestCase;

class ValkeyTest extends TestCase
{
    use RefreshDatabase;

    public function test_expiring_keys_are_shared_between_connections(): void
    {
        Redis::setex('connection-test', 5, 'shared');
        Redis::purge();

        try {
            $this->assertSame('shared', Redis::get('connection-test'));
        } finally {
            Redis::del('connection-test');
        }
    }

    public function test_the_test_user_cannot_select_the_development_database(): void
    {
        $this->expectException(RedisException::class);
        $this->expectExceptionMessageIsOrContains('NOPERM');

        Redis::select(0);
    }

    public function test_the_test_user_cannot_read_development_keys(): void
    {
        $client = Redis::connection()->client();
        $this->assertInstanceOf(PhpRedis::class, $client);

        $this->expectException(RedisException::class);
        $this->expectExceptionMessageIsOrContains('NOPERM');

        $client->rawCommand('GET', 'caseward:access-test');
    }

    public function test_the_test_user_cannot_flush_or_reconfigure_valkey(): void
    {
        $client = Redis::connection()->client();
        $this->assertInstanceOf(PhpRedis::class, $client);

        $this->assertTrue($client->rawCommand('ACL', 'DRYRUN', 'caseward_testing', 'GET', 'caseward_testing:permissions-test'));

        foreach ([['FLUSHALL'], ['FLUSHDB'], ['CONFIG', 'SET', 'appendonly', 'no']] as $command) {
            // DRYRUN verifies permissions without executing destructive commands.
            $result = $client->rawCommand('ACL', 'DRYRUN', 'caseward_testing', ...$command);

            $this->assertIsString($result);
            $this->assertStringContainsString('permissions', $result);
        }
    }

    public function test_the_rate_limiter_cache_uses_shared_valkey_state(): void
    {
        RateLimiter::hit('limiter-cache-test', 5);
        Redis::purge();

        $this->assertEquals(1, RateLimiter::attempts('limiter-cache-test'));
        $this->assertEquals(1, Cache::store('redis')->get('limiter-cache-test'));

        RateLimiter::clear('limiter-cache-test');

        $this->assertEquals(0, RateLimiter::attempts('limiter-cache-test'));
    }

    public function test_rate_limits_recover_after_the_real_window_expires(): void
    {
        RateLimiter::for('expiry-test', fn (): Limit => Limit::perSecond(1));
        Route::get('/rate-limit-expiry-test', response()->noContent(...))
            ->middleware('throttle:expiry-test');

        $this->getJson('/rate-limit-expiry-test')->assertNoContent();
        $this->getJson('/rate-limit-expiry-test')->assertTooManyRequests()->assertHeader('Retry-After');

        // Valkey and the Redis throttler use real time, not Laravel's test clock.
        Sleep::sleep(2);

        $this->getJson('/rate-limit-expiry-test')->assertNoContent();
    }

    public function test_registration_fails_closed_during_a_valkey_outage_and_recovers(): void
    {
        Exceptions::fake();
        Config::set('database.redis.default.port', 1);
        Redis::purge();

        $this->postJson('/api/register', [
            'name' => 'Alex Example',
            'email' => 'alex@example.com',
            'password' => 'a sufficiently long passphrase',
            'password_confirmation' => 'a sufficiently long passphrase',
        ])->assertServiceUnavailable()->assertExactJson([
            'message' => 'Service temporarily unavailable. Please try again.',
        ]);

        $this->assertDatabaseCount('users', 0);
        Exceptions::assertReported(RedisException::class);

        Config::set('database.redis.default.port', 6379);
        $this->app->forgetInstance('redis');
        Redis::clearResolvedInstance('redis');

        $this->postJson('/api/register')->assertUnprocessable();
    }
}
