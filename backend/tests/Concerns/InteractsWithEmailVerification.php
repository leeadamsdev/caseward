<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Models\User;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\Fixtures\UserFixture;

trait InteractsWithEmailVerification
{
    protected function setUpInteractsWithEmailVerification(): void
    {
        Notification::fake();
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    protected function login(?User $user = null): User
    {
        $user ??= UserFixture::create();
        $this->browserRequest('POST', '/api/login', UserFixture::credentials($user->email))->assertNoContent();

        return $user;
    }

    protected function signedLink(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1($user->email),
        ], absolute: false);
    }

    protected function apiLink(string $frontendLink): string
    {
        $path = parse_url($frontendLink, PHP_URL_PATH);
        $query = parse_url($frontendLink, PHP_URL_QUERY);
        $this->assertIsString($path);
        $this->assertIsString($query);

        return "/api{$path}?{$query}";
    }
}
