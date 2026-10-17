<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

use function is_string;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->hasSession();
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'email' => ['bail', 'required', 'string', 'max:254', 'email'],
            'password' => ['bail', 'required', 'string', 'max:128'],
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
