<?php

declare(strict_types=1);

return [
    'default' => env('CACHE_STORE', 'file'),
    'limiter' => 'redis',
    'stores' => [
        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
        ],
    ],
];
