<?php

declare(strict_types=1);

return [
    'driver' => env('SESSION_DRIVER', 'redis'),
    'store' => 'redis',
    'connection' => 'default',
    'prefix' => 'sessions:',
    // Serialize session writes so an overlapping request cannot undo logout.
    'block' => true,
    'block_store' => 'redis',
    'secure' => env('SESSION_SECURE_COOKIE', ! in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)),
];
