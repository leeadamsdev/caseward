<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesEmail;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

class UpdateEmailRequest extends FormRequest
{
    use ValidatesEmail;

    /** @return array<string, list<string|Unique>> */
    public function rules(): array
    {
        return [
            'account_id' => ['required', 'integer', 'min:1'],
            'email' => [...$this->emailRules(), Rule::unique('users', 'email')->ignore($this->user())],
        ];
    }
}
