<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateWorkspaceRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'account_id' => ['required', 'integer', 'min:1'],
            'name' => ['bail', 'required', 'string', 'max:100', 'not_regex:/\p{Cc}/u'],
        ];
    }
}
