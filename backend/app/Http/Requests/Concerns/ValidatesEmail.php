<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use Illuminate\Support\Str;

use function is_string;

trait ValidatesEmail
{
    /** @return list<string> */
    protected function emailRules(): array
    {
        return ['bail', 'required', 'string', 'max:254', 'email'];
    }

    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => Str::lower($email)]);
        }
    }
}
