<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\WorkspaceInvitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin WorkspaceInvitation */
class WorkspaceInvitationResource extends JsonResource
{
    /** @return array{id: string, email: string, expires_at: string, last_queued_at: string|null} */
    public function toArray(Request $_): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'expires_at' => $this->expires_at->toIso8601String(),
            'last_queued_at' => $this->last_queued_at?->toIso8601String(),
        ];
    }
}
