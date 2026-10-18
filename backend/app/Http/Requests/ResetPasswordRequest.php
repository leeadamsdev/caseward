<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesEmail;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
{
    use ValidatesEmail;

    public function authorize(): bool
    {
        return $this->hasSession() && $this->user('web') === null;
    }

    /** @return array<string, list<Password|string>> */
    public function rules(): array
    {
        return [
            'email' => $this->emailRules(),
            'token' => ['bail', 'required', 'string', 'size:64', 'regex:/\A[a-f0-9]{64}\z/'],
            'password' => ['bail', 'required', 'string', Password::defaults(), 'confirmed'],
        ];
    }
}
