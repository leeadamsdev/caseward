<?php

declare(strict_types=1);

return [
    'disks' => [
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => false,
        ],
    ],
];
