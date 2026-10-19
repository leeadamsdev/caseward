<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\WorkspaceInvitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin WorkspaceInvitation */
class WorkspaceInvitationPreviewResource extends JsonResource
{
    /** @return array{workspace: array{id: string, name: string}, email: string, expires_at: string, accepted: bool} */
    public function toArray(Request $_): array
    {
        return [
            'workspace' => ['id' => $this->workspace_id, 'name' => $this->workspace->name],
            'email' => $this->email,
            'expires_at' => $this->expires_at->toIso8601String(),
            'accepted' => $this->accepted_at !== null,
        ];
    }
}
