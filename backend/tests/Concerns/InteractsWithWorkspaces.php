<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Enums\WorkspaceRole;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Str;
use Tests\Fixtures\UserFixture;

trait InteractsWithWorkspaces
{
    use InteractsWithBrowserSession;

    protected function user(bool $verified = true): User
    {
        $id = Str::lower((string) Str::ulid());

        return UserFixture::create(email: "{$id}@example.com", verified: $verified);
    }

    protected function workspace(User $owner, string $name = 'Acme'): Workspace
    {
        return $owner->workspaces()->create(['name' => $name], ['role' => WorkspaceRole::Owner]);
    }

    protected function signIn(User $user): void
    {
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest('POST', '/api/login', UserFixture::credentials($user->email))->assertNoContent();
    }
}
