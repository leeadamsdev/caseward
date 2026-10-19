<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceInvitation;

final class WorkspaceInvitationFixture
{
    /** @return array{WorkspaceInvitation, string} */
    public static function create(Workspace $workspace, User $inviter, string $email): array
    {
        $token = bin2hex(random_bytes(32));
        $invitation = WorkspaceInvitation::query()->create([
            'workspace_id' => $workspace->id,
            'invited_by' => $inviter->id,
            'email' => $email,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(7),
        ]);

        return [$invitation, $token];
    }
}
