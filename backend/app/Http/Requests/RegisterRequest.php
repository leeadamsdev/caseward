<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesEmail;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255', 'not_regex:/\x00/'],
            'email' => [...$this->emailRules(), 'unique:users,email'],
            'password' => ['bail', 'required', 'string', Password::defaults(), 'confirmed'],
        ];
    }
}
