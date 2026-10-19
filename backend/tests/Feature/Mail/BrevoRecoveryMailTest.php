<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Actions\RecoverPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Password;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Tests\Concerns\InteractsWithQueue;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class BrevoRecoveryMailTest extends TestCase
{
    use InteractsWithQueue;
    use RefreshDatabase;

    #[DataProvider('recoveryEmails')]
    public function test_brevo_receives_branded_recovery_emails_without_contact_tracking_consent(bool $confirmation): void
    {
        $user = UserFixture::create(email: 'alex+test@example.com');
        $requests = 0;
        $client = new MockHttpClient(function (string $method, string $url, array $options) use ($user, $confirmation, &$requests): MockResponse {
            $requests++;
            $this->assertSame('POST', $method);
            $this->assertSame('https://api.brevo.com/v3/smtp/email', $url);
            $this->assertIsString($options['body']);
            $body = json_decode($options['body'], true, flags: JSON_THROW_ON_ERROR);
            $this->assertIsArray($body);
            $this->assertSame($confirmation ? 'Your password was reset | Caseward' : 'Reset your password | Caseward', $body['subject']);
            $this->assertSame([['email' => $user->email, 'contactPixelTrackingConsent' => false]], $body['to']);
            $html = $body['htmlContent'];
            $text = $body['textContent'];
            $this->assertIsString($html);
            $this->assertIsString($text);
            $this->assertStringContainsString('alt="Caseward"', $html);
            foreach ([$html, $text] as $content) {
                $this->assertStringContainsString($confirmation ? 'no further action is needed' : 'expires in 30 minutes', $content);
                $this->assertStringContainsString($confirmation ? 'http://localhost:5173/forgot-password' : 'http://localhost:5173/reset-password/', $content);
            }
            $this->assertStringContainsString($user->email, $text);
            $this->assertArrayNotHasKey('attachment', $body);

            return new MockResponse('{"messageId":"<caseward-password-reset@brevo.test>"}', ['http_code' => 201]);
        });
        $this->app->instance(HttpClientInterface::class, $client);
        Config::set('mail.mailers.brevo.key', 'test-api-key');
        Config::set('mail.default', 'brevo');
        $recovery = $this->app->make(RecoverPassword::class);
        if ($confirmation) {
            $this->assertTrue($recovery->reset($user->email, Password::createToken($user), 'a new sufficiently long password'));
        } else {
            $recovery->sendLink($user->email);
        }
        $this->processDelivery();
        $this->assertSame(1, $requests);
    }

    /** @return iterable<string, array{bool}> */
    public static function recoveryEmails(): iterable
    {
        yield 'reset link' => [false];
        yield 'reset confirmation' => [true];
    }
}
