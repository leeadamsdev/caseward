<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithEmailVerification;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class MailpitVerificationTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithEmailVerification;
    use RefreshDatabase;

    #[DataProvider('mailpitDeliveries')]
    public function test_a_real_verification_email_is_captured_by_mailpit_and_its_link_verifies_the_account(string $journey): void
    {
        Notification::swap(new ChannelManager($this->app));
        Config::set('mail.default', 'smtp');
        $testId = bin2hex(random_bytes(16));
        $email = "verification-{$testId}@example.test";
        if ($journey === 'correction') {
            $user = $this->login(UserFixture::create("typo-{$email}"));
            $this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => $email])
                ->assertOk()->assertJsonPath('meta.verification_email_sent', true);
        } elseif ($journey === 'resend') {
            $this->login(UserFixture::create($email));
            $this->browserRequest('POST', '/api/email/verification-notification')
                ->assertNoContent()->assertHeader('Retry-After', '60');
        } else {
            $this->browserRequest('POST', '/api/register', [...UserFixture::registration(), 'email' => $email])
                ->assertCreated()->assertJsonPath('meta.verification_email_sent', true);
        }
        $response = Http::timeout(5)->get('http://mailpit:8025/api/v1/search', ['query' => "to:{$email}"])->throw();
        $messages = $response->json('messages');
        $this->assertIsArray($messages);
        $this->assertCount(1, $messages);
        $message = reset($messages);
        $this->assertIsArray($message);
        $id = $message['ID'];
        $this->assertIsString($id);

        try {
            $captured = Http::timeout(5)->get("http://mailpit:8025/api/v1/message/{$id}")->throw();
            $this->assertSame($email, $captured->json('To.0.Address'));
            $this->assertSame('Verify your email | Caseward', $captured->json('Subject'));
            $html = $captured->json('HTML');
            $this->assertIsString($html);
            $this->assertStringContainsString('alt="Caseward"', $html);
            $this->assertStringContainsString('expires in 1 hour', $html);
            $this->assertSame(1, preg_match('/href="([^"]*\/email\/verify\/[^"]+)"/', $html, $matches));
            $matchedLink = $matches[1] ?? null;
            $this->assertIsString($matchedLink);
            $link = html_entity_decode($matchedLink, ENT_QUOTES | ENT_HTML5);
            $this->assertStringStartsWith('http://localhost:5173/email/verify/', $link);
            $this->assertStringNotContainsString('password', $link);
            $text = $captured->json('Text');
            $this->assertIsString($text);
            $this->assertStringContainsString($email, $text);
            $this->assertStringContainsString($link, $text);
            $this->assertStringNotContainsString('&amp;', $text);
            $this->browserRequest('POST', $this->apiLink($link))->assertNoContent();
            $this->assertTrue(User::query()->sole()->hasVerifiedEmail());
        } finally {
            Http::timeout(5)->delete('http://mailpit:8025/api/v1/messages', ['IDs' => [$id]])->throw();
        }
    }

    /** @return iterable<string, array{string}> */
    public static function mailpitDeliveries(): iterable
    {
        foreach (['registration', 'resend', 'correction'] as $journey) {
            yield $journey => [$journey];
        }
    }
}
