<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Models\User;

final class UserFixture
{
    public const string PASSWORD = 'correct horse battery staple';

    public static function create(string $email = 'alex@example.com', string $password = self::PASSWORD, bool $verified = false): User
    {
        return User::query()->forceCreate([
            'name' => 'Alex Example',
            ...self::credentials($email, $password),
            'email_verified_at' => $verified ? now() : null,
        ]);
    }

    /** @return array{email: string, password: string} */
    public static function credentials(string $email = 'alex@example.com', string $password = self::PASSWORD): array
    {
        return ['email' => $email, 'password' => $password];
    }

    /** @return array{name: string, email: string, password: string, password_confirmation: string} */
    public static function registration(): array
    {
        return ['name' => 'Alex Example', ...self::credentials(), 'password_confirmation' => self::PASSWORD];
    }
}
