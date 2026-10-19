<?php

declare(strict_types=1);

namespace App\Redis;

use Illuminate\Redis\Connectors\PhpRedisConnector;
use LogicException;
use Redis;

class CheckedPhpRedisConnector extends PhpRedisConnector
{
    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $options
     */
    public function connect(array $config, array $options): CheckedPhpRedisConnection
    {
        $connector = function () use ($config, $options): Redis {
            $client = parent::connect($config, $options)->client();
            if (! $client instanceof Redis) {
                throw new LogicException('Caseward requires a native PhpRedis connection.');
            }

            return $client;
        };

        return new CheckedPhpRedisConnection($connector(), $connector, $config);
    }
}
