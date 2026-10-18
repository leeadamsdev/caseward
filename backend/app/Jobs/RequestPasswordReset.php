<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\RecoverPassword;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RequestPasswordReset implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(public readonly string $email) {}

    public function handle(RecoverPassword $recovery): void
    {
        $recovery->sendLink($this->email);
    }
}
