<?php

declare(strict_types=1);

namespace App\Redis;

use Illuminate\Redis\Connections\PhpRedisConnection;
use RedisException;

class CheckedPhpRedisConnection extends PhpRedisConnection
{
    /**
     * @param  string  $method
     * @param  array<mixed>  $parameters
     */
    public function command($method, array $parameters = []): mixed
    {
        // PhpRedis can return false for both a legitimate result and a rejected Lua script.
        $this->client->clearLastError();
        $result = parent::command($method, $parameters);
        $error = $this->client->getLastError();
        if ($error !== null) {
            throw new RedisException($error);
        }

        return $result;
    }
}
