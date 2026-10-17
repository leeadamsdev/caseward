<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Mail\Message;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Tests\TestCase;

class MailTest extends TestCase
{
    public function test_tests_cannot_deliver_mail_or_load_production_credentials(): void
    {
        $this->assertSame('array', Config::get('mail.default'));
        $this->assertEmpty(Config::get('mail.mailers.brevo.key'));
        $this->assertInstanceOf(ArrayTransport::class, Mail::mailer()->getSymfonyTransport());
    }

    public function test_local_smtp_targets_mailpit_with_a_bounded_timeout(): void
    {
        $transport = Mail::mailer('smtp')->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);
        $stream = $transport->getStream();
        $this->assertInstanceOf(SocketStream::class, $stream);
        $this->assertSame('mailpit', $stream->getHost());
        $this->assertSame(1025, $stream->getPort());
        $this->assertSame(10.0, $stream->getTimeout());
    }

    #[DataProvider('missingKeys')]
    public function test_brevo_rejects_missing_credentials_before_a_request_is_sent(?string $key): void
    {
        Config::set('mail.mailers.brevo.key', $key);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessageIsOrContains('BREVO_API_KEY must be configured');

        Mail::mailer('brevo');
    }

    /** @return iterable<string, array{string|null}> */
    public static function missingKeys(): iterable
    {
        yield 'unset' => [null];
        yield 'empty' => [''];
        yield 'blank' => ['   '];
    }

    public function test_laravel_mail_uses_the_brevo_api_with_the_expected_content_and_safe_http_options(): void
    {
        $requests = 0;
        $client = new MockHttpClient(function (string $method, string $url, array $options) use (&$requests): MockResponse {
            $requests++;
            $this->assertSame('POST', $method);
            $this->assertSame('https://api.brevo.com/v3/smtp/email', $url);
            $this->assertIsArray($options['normalized_headers']);
            $this->assertSame(['api-key: test-api-key'], $options['normalized_headers']['api-key']);
            $this->assertSame(10.0, $options['timeout']);
            $this->assertSame(15.0, $options['max_duration']);
            $this->assertSame(0, $options['max_redirects']);
            $this->assertTrue($options['verify_peer'] ?? HttpClientInterface::OPTIONS_DEFAULTS['verify_peer']);
            $this->assertTrue($options['verify_host'] ?? HttpClientInterface::OPTIONS_DEFAULTS['verify_host']);
            $this->assertIsString($options['body']);
            $body = json_decode($options['body'], true, flags: JSON_THROW_ON_ERROR);
            $this->assertIsArray($body);
            $this->assertSame(['email' => 'hello@caseward.test', 'name' => 'Caseward'], $body['sender']);
            $this->assertSame([['email' => 'alex@example.test', 'contactPixelTrackingConsent' => false]], $body['to']);
            $this->assertSame([['email' => 'copy@example.test', 'contactPixelTrackingConsent' => false]], $body['cc']);
            $this->assertSame([['email' => 'private@example.test', 'contactPixelTrackingConsent' => false]], $body['bcc']);
            $this->assertSame(['email' => 'help@caseward.test'], $body['replyTo']);
            $this->assertSame('Caseward delivery test', $body['subject']);
            $this->assertSame('<p>Caseward mail is connected.</p>', $body['htmlContent']);
            $this->assertSame('Caseward mail is connected.', $body['textContent']);

            return new MockResponse('{"messageId":"<caseward-test@brevo.test>"}', ['http_code' => 201]);
        });
        $this->app->instance(HttpClientInterface::class, $client);
        Config::set('mail.mailers.brevo.key', 'test-api-key');

        $message = Mail::mailer('brevo')->html('<p>Caseward mail is connected.</p>', function (Message $message): void {
            $message->to('alex@example.test')->cc('copy@example.test')->bcc('private@example.test')->replyTo('help@caseward.test')->subject('Caseward delivery test')->text('Caseward mail is connected.');
        });

        $this->assertNotNull($message);
        $this->assertSame('<caseward-test@brevo.test>', $message->getMessageId());
        $this->assertSame(1, $requests);
    }

    public function test_brevo_receives_the_branded_verification_html_plain_text_and_hosted_logo(): void
    {
        $requests = 0;
        $client = new MockHttpClient(function (string $method, string $url, array $options) use (&$requests): MockResponse {
            $requests++;
            $this->assertSame('POST', $method);
            $this->assertSame('https://api.brevo.com/v3/smtp/email', $url);
            $this->assertIsString($options['body']);
            $body = json_decode($options['body'], true, flags: JSON_THROW_ON_ERROR);
            $this->assertIsArray($body);
            $this->assertSame('Verify your email | Caseward', $body['subject']);
            $html = $body['htmlContent'];
            $text = $body['textContent'];
            $this->assertIsString($html);
            $this->assertIsString($text);
            $this->assertStringContainsString('src="https://images.example.test/caseward-logo-light.png"', $html);
            $this->assertStringContainsString('expires in 1 hour', $html);
            $this->assertStringContainsString('alex@example.test', $text);
            $this->assertSame(1, preg_match('/href="([^"]*\/email\/verify\/[^\"]+)"/', $html, $matches));
            $link = $matches[1] ?? null;
            $this->assertIsString($link);
            $this->assertStringContainsString(html_entity_decode($link, ENT_QUOTES | ENT_HTML5), $text);
            $this->assertStringNotContainsString('cid:', $html);
            $this->assertArrayNotHasKey('attachment', $body);
            $this->assertSame([['email' => 'alex@example.test', 'contactPixelTrackingConsent' => false]], $body['to']);

            return new MockResponse('{"messageId":"<caseward-verification@brevo.test>"}', ['http_code' => 201]);
        });
        $this->app->instance(HttpClientInterface::class, $client);
        Config::set('mail.mailers.brevo.key', 'test-api-key');
        Config::set('mail.default', 'brevo');
        Config::set('mail.logo_url', 'https://images.example.test/caseward-logo-light.png');
        $user = (new User(['email' => 'alex@example.test']))->forceFill(['id' => 42]);

        $user->sendEmailVerificationNotification();

        $this->assertSame(1, $requests);
    }

    #[DataProvider('deliveryFailures')]
    public function test_provider_failures_propagate_without_silent_fallback_or_duplicate_sends(int $status, string $body): void
    {
        $requests = 0;
        $client = new MockHttpClient(function () use (&$requests, $status, $body): MockResponse {
            $requests++;

            return new MockResponse($body, ['http_code' => $status]);
        });
        $this->app->instance(HttpClientInterface::class, $client);
        Config::set('mail.mailers.brevo.key', 'test-api-key');

        $this->expectException(TransportExceptionInterface::class);

        try {
            Mail::mailer('brevo')->raw('Test', fn (Message $message) => $message->to('alex@example.test')->subject('Test'));
        } finally {
            $this->assertSame(1, $requests);
        }
    }

    /** @return iterable<string, array{int, string}> */
    public static function deliveryFailures(): iterable
    {
        yield 'unauthorized' => [401, '{"message":"Unauthorized"}'];
        yield 'invalid sender' => [400, '{"message":"Invalid sender"}'];
        yield 'rate limited' => [429, '{"message":"Rate limit reached"}'];
        yield 'unavailable' => [503, '{"message":"Service unavailable"}'];
        yield 'invalid response' => [502, '<html>Bad gateway</html>'];
    }

    public function test_network_failures_propagate_without_fabricating_success(): void
    {
        $client = new MockHttpClient(fn (): never => throw new TransportException('Connection timed out.'));
        $this->app->instance(HttpClientInterface::class, $client);
        Config::set('mail.mailers.brevo.key', 'test-api-key');

        $this->expectException(TransportException::class);

        Mail::mailer('brevo')->raw('Test', fn (Message $message) => $message->to('alex@example.test')->subject('Test'));
    }

    public function test_local_smtp_mail_is_captured_by_mailpit(): void
    {
        $testId = bin2hex(random_bytes(16));
        $subject = "Caseward mail test {$testId}";
        $body = 'This message must stay in the local development inbox.';

        Mail::mailer('smtp')->raw($body, fn (Message $message) => $message->to('mailpit-test@example.test')->subject($subject));

        $response = Http::timeout(5)->get('http://mailpit:8025/api/v1/search', ['query' => "subject:\"{$subject}\""])->throw();
        $messages = $response->json('messages');
        $this->assertIsArray($messages);
        $this->assertCount(1, $messages);
        $message = reset($messages);
        $this->assertIsArray($message);
        $id = $message['ID'];
        $this->assertIsString($id);

        try {
            $captured = Http::timeout(5)->get("http://mailpit:8025/api/v1/message/{$id}")->throw();
            $this->assertSame($subject, $captured->json('Subject'));
            $text = $captured->json('Text');
            $this->assertIsString($text);
            $this->assertSame($body, trim($text));
            $this->assertSame('hello@caseward.test', $captured->json('From.Address'));
            $this->assertSame('mailpit-test@example.test', $captured->json('To.0.Address'));
        } finally {
            Http::timeout(5)->delete('http://mailpit:8025/api/v1/messages', ['IDs' => [$id]])->throw();
        }
    }
}
