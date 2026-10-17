<?php

declare(strict_types=1);

$frontend = rtrim((string) env('APP_URL', 'http://localhost:5173'), '/');

return [
    'default' => env('MAIL_MAILER', 'smtp'),
    'logo_url' => env('MAIL_LOGO_URL') ?: "{$frontend}/logos/caseward-logo-light.png",
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
