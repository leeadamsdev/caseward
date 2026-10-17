<?php

declare(strict_types=1);

namespace App\Providers;

use App\Mail\BrevoHttpClient;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;
use LogicException;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;
use Symfony\Contracts\HttpClient\HttpClientInterface;

use function is_string;

class MailServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(HttpClientInterface::class, fn (): HttpClientInterface => HttpClient::create());
    }

    public function boot(): void
    {
        Mail::extend('brevo', function (): BrevoApiTransport {
            $key = Config::get('mail.mailers.brevo.key');

            if (! is_string($key) || trim($key) === '') {
                throw new LogicException('BREVO_API_KEY must be configured to send email through Brevo.');
            }

            $client = new BrevoHttpClient($this->app->make(HttpClientInterface::class));
            $client = $client->withOptions([
                'timeout' => 10,
                'max_duration' => 15,
                'max_redirects' => 0,
            ]);

            return new BrevoApiTransport($key, $client);
        });
    }
}
