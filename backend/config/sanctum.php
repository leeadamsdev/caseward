<?php

declare(strict_types=1);

return [
    'stateful' => explode(',', (string) env('SANCTUM_STATEFUL_DOMAINS', 'localhost:5173,127.0.0.1:5173')),
];
