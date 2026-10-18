<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\WorkspaceRole;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * @property string $workspace_id
 * @property int $user_id
 * @property WorkspaceRole $role
 */
class WorkspaceMembership extends Pivot
{
    protected $table = 'workspace_memberships';

    protected function casts(): array
    {
        return ['role' => WorkspaceRole::class];
    }
}
