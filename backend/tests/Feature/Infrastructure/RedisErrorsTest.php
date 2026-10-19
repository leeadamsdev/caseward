<?php

declare(strict_types=1);

namespace Tests\Feature\Infrastructure;

use App\Models\WorkspaceInvitation;
use App\Redis\CheckedPhpRedisConnection;
use Illuminate\Cache\RedisStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Redis\Limiters\DurationLimiter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Session;
use Redis as PhpRedis;
use RedisException;
use Tests\Concerns\InteractsWithQueue;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class RedisErrorsTest extends TestCase
{
    use InteractsWithQueue;
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_lua_server_errors_are_exceptions_even_when_phpredis_returns_false(): void
    {
        $this->expectException(RedisException::class);
        $this->expectExceptionMessageIsOrContains('simulated server error');

        $this->connection()->eval("return redis.error_reply('ERR simulated server error')", 0);
    }

    public function test_legitimate_false_results_and_old_native_errors_do_not_become_exceptions(): void
    {
        $client = Redis::connection()->client();
        $this->assertInstanceOf(PhpRedis::class, $client);
        $this->assertFalse($client->eval("return redis.error_reply('ERR old native error')"));
        $this->assertNotNull($client->getLastError());
        $this->assertNull(Redis::get('missing-key'));
        $this->assertNull($client->getLastError());
        $this->assertFalse($this->connection()->eval('return false', 0));

        $store = Cache::store('redis')->getStore();
        $this->assertInstanceOf(RedisStore::class, $store);
        $lock = $store->lock('contested-lock', 10);
        $this->assertTrue($lock->get());
        try {
            $this->assertFalse($store->lock('contested-lock', 10)->get());
        } finally {
            $lock->release();
        }
        Redis::purge();
        $this->assertSame('ok', $this->connection()->eval("return 'ok'", 0));
    }

    public function test_real_queue_script_failure_keeps_an_invitation_retryable_and_never_reports_it_as_queued(): void
    {
        Exceptions::fake();
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        Redis::set('queues:default', 'wrong-type');
        $path = "/api/workspaces/{$workspace->id}/invitations";
        $this->browserRequest('POST', $path, ['account_id' => $owner->id, 'email' => 'new@example.test'])
            ->assertServiceUnavailable()->assertJsonPath('code', 'invitation_queue_unavailable');
        $invitation = WorkspaceInvitation::query()->sole();
        $this->assertNull($invitation->last_queued_at);
        Exceptions::assertReported(RedisException::class);
        Redis::del('queues:default');
        $this->browserRequest('POST', "{$path}/{$invitation->id}/resend", ['account_id' => $owner->id])->assertOk();
        $this->assertSame(1, $this->queue()->pendingSize());
    }

    public function test_rate_limiter_script_failure_is_an_exception_instead_of_a_false_admission(): void
    {
        Redis::set('broken-limiter', 'wrong-type');
        $limiter = new DurationLimiter(Redis::connection(), 'broken-limiter', 5, 60);
        $this->expectException(RedisException::class);
        $this->expectExceptionMessageIsOrContains('WRONGTYPE');
        try {
            $limiter->acquire();
        } finally {
            Redis::del('broken-limiter');
        }
    }

    public function test_worker_pause_state_can_be_read_through_the_shared_cache_with_the_real_acl(): void
    {
        Config::set('cache.default', 'redis');
        $key = 'illuminate:queue:paused:redis:default';
        $this->assertSame([], Queue::getPausedQueues('redis', ['default']));
        Cache::put($key, true, 10);
        try {
            $this->assertSame(['default'], Queue::getPausedQueues('redis', ['default']));
        } finally {
            Cache::forget($key);
        }
    }

    public function test_session_read_failure_fails_closed_and_recovers_after_the_store_is_repaired(): void
    {
        Exceptions::fake();
        $this->signIn($this->user());
        $key = 'sessions:'.Session::getId();
        $saved = Redis::get($key);
        $this->assertIsString($saved);
        Redis::del($key);
        Redis::rpush($key, 'wrong-type');
        try {
            $this->browserRequest('GET', '/api/session')->assertServiceUnavailable()->assertExactJson([
                'message' => 'Service temporarily unavailable. Please try again.',
            ]);
            Exceptions::assertReported(RedisException::class);
        } finally {
            Redis::del($key);
            Redis::setex($key, 120, $saved);
        }
        $this->browserRequest('GET', '/api/session')->assertOk();
    }

    private function connection(): CheckedPhpRedisConnection
    {
        $connection = Redis::connection();
        $this->assertInstanceOf(CheckedPhpRedisConnection::class, $connection);

        return $connection;
    }
}
