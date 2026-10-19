<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\WorkspaceRole;
use App\Models\User;
use App\Models\WorkspaceMembership;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 *
 * @property-read WorkspaceMembership $membership
 */
class WorkspaceMemberResource extends JsonResource
{
    /** @return array{id: int, name: string, email: string, role: WorkspaceRole} */
    public function toArray(Request $_): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->membership->role,
        ];
    }
}
