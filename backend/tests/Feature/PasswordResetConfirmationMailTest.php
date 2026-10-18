<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Notifications\PasswordResetConfirmationNotification;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class PasswordResetConfirmationMailTest extends TestCase
{
    public function test_confirmation_has_branded_html_plain_text_and_a_public_recovery_link(): void
    {
        Config::set('app.url', 'https://app.caseward.test/');
        Config::set('mail.logo_url', 'https://images.example.test/logo.png');
        $mail = (new PasswordResetConfirmationNotification(CarbonImmutable::parse('2026-10-18 16:45:00', 'Europe/London')))
            ->toMail((new AnonymousNotifiable)->route('mail', 'alex+test@example.test'));
        $this->travel(2)->days();
        $html = (string) $mail->render();
        $text = view('mail.password-reset-confirmation-text', [
            'email' => 'alex+test@example.test',
            'actionText' => $mail->actionText,
            'actionUrl' => $mail->actionUrl,
            'resetAt' => '18 October 2026 at 15:45 UTC',
        ])->render();

        $this->assertSame('Your password was reset | Caseward', $mail->subject);
        $this->assertSame('https://app.caseward.test/forgot-password', $mail->actionUrl);
        $this->assertStringContainsString('src="https://images.example.test/logo.png"', $html);
        $this->assertStringContainsString('alt="Caseward"', $html);
        $this->assertStringContainsString('ACCOUNT SECURITY', $html);
        foreach ([$html, $text] as $body) {
            $this->assertStringContainsString('alex+test@example.test', $body);
            $this->assertStringContainsString('18 October 2026 at 15:45 UTC', $body);
            $this->assertStringContainsString('no further action is needed', $body);
            $this->assertStringContainsString('request a new reset link immediately', $body);
            $this->assertStringContainsString('Existing sessions have been signed out', $body);
            $this->assertStringContainsString('secure your email account as well', $body);
            $this->assertStringNotContainsString('expires', $body);
            $this->assertStringNotContainsString('/reset-password/', $body);
            $this->assertStringNotContainsString('token=', $body);
        }
        $this->assertSame(2, substr_count($html, 'href="https://app.caseward.test/forgot-password"'));
        $this->assertStringContainsString($mail->actionUrl, $text);
        $this->assertStringNotContainsString('<html', $text);
    }

    public function test_dynamic_values_are_escaped_in_html_and_preserved_in_plain_text(): void
    {
        Config::set('mail.logo_url', 'https://images.example.test/logo.png?variant=light&size=200');
        $email = '"><img src=x onerror=alert(1)>';
        $mail = (new PasswordResetConfirmationNotification(CarbonImmutable::now('UTC')))
            ->toMail((new AnonymousNotifiable)->route('mail', $email));
        $html = (string) $mail->render();
        $text = view('mail.password-reset-confirmation-text', [
            'email' => $email,
            'actionText' => $mail->actionText,
            'actionUrl' => $mail->actionUrl,
            'resetAt' => '18 October 2026 at 15:45 UTC',
        ])->render();

        $this->assertStringNotContainsString('<img src=x', $html);
        $this->assertStringContainsString(e($email), $html);
        $this->assertStringContainsString('logo.png?variant=light&amp;size=200', $html);
        $this->assertStringContainsString($email, $text);
    }
}
