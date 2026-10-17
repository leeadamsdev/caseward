<?php

declare(strict_types=1);

return [
    'redis' => [
        'client' => 'phpredis',
        'options' => [
            'prefix' => env('REDIS_PREFIX', 'caseward:'),
        ],
        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', 'valkey'),
            'port' => (int) env('REDIS_PORT', 6379),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'database' => (int) env('REDIS_DB', 0),
            'timeout' => 1.0,
            'read_timeout' => 1.0,
            'max_retries' => 0,
        ],
    ],
];
