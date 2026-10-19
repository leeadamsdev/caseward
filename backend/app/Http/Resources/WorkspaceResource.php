<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\WorkspaceRole;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Workspace
 *
 * @property-read WorkspaceMembership $membership
 */
class WorkspaceResource extends JsonResource
{
    /** @return array{id: string, name: string, role: WorkspaceRole} */
    public function toArray(Request $_): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->membership->role,
        ];
    }
}
