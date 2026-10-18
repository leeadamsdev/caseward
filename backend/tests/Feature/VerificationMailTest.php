<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Mail\Mailer;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

class VerificationMailTest extends TestCase
{
    public function test_verification_mail_has_branded_html_and_an_equivalent_plain_text_link(): void
    {
        $this->freezeTime();
        $user = (new User(['email' => 'alex@example.test']))->forceFill(['id' => 42]);
        $notification = new VerifyEmail;
        $mail = $notification->toMail($user);
        $url = $mail->actionUrl;

        $user->notify($notification);
        $mailer = Mail::mailer();
        $this->assertInstanceOf(Mailer::class, $mailer);
        $transport = $mailer->getSymfonyTransport();
        $this->assertInstanceOf(ArrayTransport::class, $transport);
        $sent = $transport->messages()->sole();
        $this->assertInstanceOf(SentMessage::class, $sent);
        $message = $sent->getOriginalMessage();
        $this->assertInstanceOf(Email::class, $message);
        $this->assertSame('Verify your email | Caseward', $message->getSubject());
        $html = $message->getHtmlBody();
        $text = $message->getTextBody();
        $this->assertIsString($html);
        $this->assertIsString($text);
        $this->assertStringContainsString('alt="Caseward"', $html);
        $this->assertStringContainsString('src="http://localhost:5173/logos/caseward-logo-light.png"', $html);
        $this->assertStringContainsString($user->email, $html);
        $this->assertStringContainsString($user->email, $text);
        $this->assertStringContainsString('expires in 1 hour', $html);
        $this->assertStringContainsString('expires in 1 hour', $text);
        $this->assertStringContainsString('you can ignore this email', $html);
        $this->assertStringContainsString('you can ignore this email', $text);
        $this->assertSame(2, substr_count($html, 'href="'.e($url).'"'));
        $this->assertStringContainsString($url, $text);
        $this->assertStringNotContainsString('&amp;', $text);
        $this->assertStringNotContainsString('<html', $text);
        $this->assertStringNotContainsString('cid:', $html);
        $this->assertEmpty($message->getAttachments());
    }

    public function test_html_escapes_values_without_corrupting_the_plain_text_part(): void
    {
        Config::set('mail.logo_url', 'https://images.example.test/logo.png?variant=light&size=200');
        $user = (new User(['email' => '"><img src=x onerror=alert(1)>']))->forceFill(['id' => 42]);
        $mail = (new VerifyEmail)->toMail($user);
        $html = (string) $mail->render();
        $text = view('mail.verify-email-text', [
            'email' => $user->email,
            'actionText' => $mail->actionText,
            'actionUrl' => $mail->actionUrl,
        ])->render();
        $this->assertStringNotContainsString('<img src=x', $html);
        $this->assertStringContainsString(e($user->email), $html);
        $this->assertStringContainsString('logo.png?variant=light&amp;size=200', $html);
        $this->assertStringContainsString($user->email, $text);
    }
}
