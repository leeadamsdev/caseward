<?php

declare(strict_types=1);

namespace App\Mail;

use LogicException;
use Symfony\Component\HttpClient\DecoratorTrait;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

use function is_array;

class BrevoHttpClient implements HttpClientInterface
{
    use DecoratorTrait;

    /** @param array<string, mixed> $options */
    public function request(string $method, string $url, array $options = []): ResponseInterface
    {
        if ($method === 'POST' && $url === 'https://api.brevo.com/v3/smtp/email') {
            $payload = $options['json'] ?? null;

            if (! is_array($payload)) {
                throw new LogicException('Brevo email requests require a JSON payload.');
            }

            // Symfony's transport does not expose Brevo's per-recipient tracking preference.
            foreach (['to', 'cc', 'bcc'] as $field) {
                if (! isset($payload[$field])) {
                    continue;
                }

                if (! is_array($payload[$field])) {
                    throw new LogicException('Brevo recipients must be a list of addresses.');
                }

                foreach ($payload[$field] as $index => $recipient) {
                    if (! is_array($recipient)) {
                        throw new LogicException('Brevo recipients must be address objects.');
                    }

                    $recipient['contactPixelTrackingConsent'] = false;
                    $payload[$field][$index] = $recipient;
                }
            }

            $options['json'] = $payload;
        }

        return $this->client->request($method, $url, $options);
    }
}
