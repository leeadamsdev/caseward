<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class WorkspaceInvitationRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['account_id' => ['required', 'integer', 'min:1']];
    }

    protected function passedValidation(): void
    {
        $user = $this->user();
        abort_unless($user instanceof User, 401);
        if ($this->integer('account_id') !== $user->id) {
            abort(response()->json([
                'message' => 'The signed-in account changed. Reopen the form before trying again.',
                'code' => 'account_context_changed',
            ], 409));
        }
    }
}
