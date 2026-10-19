<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\WorkspaceRole;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use Illuminate\Auth\Access\Response;

class WorkspacePolicy
{
    public function manageInvitations(User $user, Workspace $workspace): Response
    {
        $membership = WorkspaceMembership::query()->where('workspace_id', $workspace->id)->where('user_id', $user->id)->first();
        if ($membership === null) {
            return Response::denyAsNotFound('Not Found.');
        }

        return $membership->role === WorkspaceRole::Owner
            ? Response::allow()
            : Response::deny('Only workspace owners can manage invitations.');
    }

    public function viewMembers(User $user, Workspace $workspace): Response
    {
        return $workspace->users()->whereKey($user->id)->exists()
            ? Response::allow()
            : Response::denyAsNotFound('Not Found.');
    }
}
