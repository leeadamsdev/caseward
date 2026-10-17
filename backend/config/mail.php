<?php

declare(strict_types=1);

return [
    'default' => env('MAIL_MAILER', 'smtp'),
    'mailers' => [
        'smtp' => [
            'transport' => 'smtp',
            'scheme' => 'smtp',
            'host' => env('MAIL_HOST', 'mailpit'),
            'port' => (int) env('MAIL_PORT', 1025),
            'timeout' => 10,
        ],
        'brevo' => [
            'transport' => 'brevo',
            'key' => env('BREVO_API_KEY'),
        ],
        'array' => [
            'transport' => 'array',
        ],
    ],
    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'hello@caseward.test'),
        'name' => env('MAIL_FROM_NAME', 'Caseward'),
    ],
];
