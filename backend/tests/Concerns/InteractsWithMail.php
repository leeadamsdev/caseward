<?php

declare(strict_types=1);

namespace Tests\Concerns;

use Illuminate\Mail\Mailer;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;

trait InteractsWithMail
{
    protected function arrayTransport(): ArrayTransport
    {
        $mailer = Mail::mailer('array');
        $this->assertInstanceOf(Mailer::class, $mailer);
        $transport = $mailer->getSymfonyTransport();
        $this->assertInstanceOf(ArrayTransport::class, $transport);

        return $transport;
    }

    protected function sentEmail(): Email
    {
        $sent = $this->arrayTransport()->messages()->sole();
        $this->assertInstanceOf(SentMessage::class, $sent);
        $message = $sent->getOriginalMessage();
        $this->assertInstanceOf(Email::class, $message);

        return $message;
    }
}
