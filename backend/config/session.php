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
    // Leave headroom beyond the 15-second mail API deadline while holding the session lock.
    'block_lock_seconds' => 60,
    'secure' => env('SESSION_SECURE_COOKIE', ! in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)),
];
