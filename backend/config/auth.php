<?php

declare(strict_types=1);

return [
    'passwords' => [
        'users' => [
            'driver' => 'cache',
            'provider' => 'users',
            'store' => 'passwords',
            'expire' => 30,
            'throttle' => 60,
        ],
    ],
];
