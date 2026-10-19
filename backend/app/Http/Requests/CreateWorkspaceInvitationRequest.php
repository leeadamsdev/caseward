<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesEmail;

class CreateWorkspaceInvitationRequest extends WorkspaceInvitationRequest
{
    use ValidatesEmail;

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [...parent::rules(), 'email' => $this->emailRules()];
    }
}
