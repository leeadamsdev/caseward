<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Models\User;
use App\Notifications\PasswordResetNotification;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class PasswordResetMailTest extends TestCase
{
    public function test_reset_mail_has_branded_html_plain_text_and_the_configured_expiry(): void
    {
        Config::set('auth.passwords.users.expire', 45);
        Config::set('mail.logo_url', 'https://images.example.test/logo.png');
        $user = new User(['email' => 'alex+test@example.test']);
        $mail = (new PasswordResetNotification(str_repeat('a', 64)))->toMail($user);
        $html = (string) $mail->render();
        $text = view('mail.reset-password-text', [
            'email' => $user->email,
            'actionText' => $mail->actionText,
            'actionUrl' => $mail->actionUrl,
            'expireMinutes' => 45,
        ])->render();

        $this->assertSame('Reset your password | Caseward', $mail->subject);
        $this->assertStringContainsString('src="https://images.example.test/logo.png"', $html);
        $this->assertStringContainsString('alt="Caseward"', $html);
        $this->assertStringContainsString('PASSWORD RECOVERY', $html);
        $this->assertStringContainsString($user->email, $html);
        $this->assertStringContainsString($user->email, $text);
        $this->assertStringContainsString('expires in 45 minutes', $html);
        $this->assertStringContainsString('expires in 45 minutes', $text);
        $this->assertStringContainsString('You can use it once', $html);
        $this->assertStringContainsString('password won’t change unless', $html);
        $this->assertSame(2, substr_count($html, 'href="'.e($mail->actionUrl).'"'));
        $this->assertStringContainsString($mail->actionUrl, $text);
        $this->assertStringNotContainsString('&amp;', $text);
        $this->assertStringNotContainsString('<html', $text);
        $this->assertStringNotContainsString('cid:', $html);
    }

    public function test_dynamic_values_are_escaped_only_in_html(): void
    {
        Config::set('mail.logo_url', 'https://images.example.test/logo.png?variant=light&size=200');
        $user = new User(['email' => '"><img src=x onerror=alert(1)>']);
        $mail = (new PasswordResetNotification(str_repeat('a', 64)))->toMail($user);
        $html = (string) $mail->render();
        $text = view('mail.reset-password-text', [
            'email' => $user->email,
            'actionText' => $mail->actionText,
            'actionUrl' => $mail->actionUrl,
            'expireMinutes' => 30,
        ])->render();

        $this->assertStringNotContainsString('<img src=x', $html);
        $this->assertStringContainsString(e($user->email), $html);
        $this->assertStringContainsString('logo.png?variant=light&amp;size=200', $html);
        $this->assertStringContainsString($user->email, $text);
        $this->assertStringContainsString($mail->actionUrl, $text);
    }
}
