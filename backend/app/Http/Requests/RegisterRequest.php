<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

use function is_string;

class RegisterRequest extends FormRequest
{
    /** @return array<string, list<Password|string>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', 'not_regex:/\x00/'],
            'email' => ['bail', 'required', 'string', 'max:254', 'email', 'unique:users,email'],
            'password' => ['bail', 'required', 'string', Password::min(15)->max(128), 'confirmed'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => Str::lower($email)]);
        }
    }
}
