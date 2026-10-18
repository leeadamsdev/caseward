<?php

declare(strict_types=1);

return [
    'default' => env('CACHE_STORE', 'file'),
    'limiter' => 'redis',
    'stores' => [
        'passwords' => [
            'driver' => 'redis',
            'connection' => 'default',
            'prefix' => 'passwords:',
        ],
        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
        ],
    ],
];
