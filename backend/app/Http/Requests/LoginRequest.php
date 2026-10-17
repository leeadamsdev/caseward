<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesEmail;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    use ValidatesEmail;

    public function authorize(): bool
    {
        return $this->hasSession() && $this->user('web') === null;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'email' => $this->emailRules(),
            'password' => ['bail', 'required', 'string', 'max:128'],
        ];
    }
}
