<?php

declare(strict_types=1);

return [
    'default' => 'redis',
    'connections' => [
        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
            'queue' => 'default',
            'retry_after' => 90,
            'block_for' => null,
            'after_commit' => true,
        ],
    ],
    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'file'),
        'path' => storage_path('framework/failed-jobs.json'),
        'limit' => 100,
    ],
];
