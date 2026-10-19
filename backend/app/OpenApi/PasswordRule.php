<?php

declare(strict_types=1);

namespace App\OpenApi;

use Dedoc\Scramble\Contracts\RuleTransformer;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Dedoc\Scramble\Support\Generator\Types\Type;
use Dedoc\Scramble\Support\RuleTransforming\NormalizedRule;
use Dedoc\Scramble\Support\RuleTransforming\RuleTransformerContext;
use Illuminate\Validation\Rules\Password;

class PasswordRule implements RuleTransformer
{
    public function shouldHandle(NormalizedRule $rule): bool
    {
        return $rule->rule instanceof Password;
    }

    public function toSchema(Type $previous, NormalizedRule $rule, RuleTransformerContext $_): Type
    {
        if (! $rule->rule instanceof Password || ! $previous instanceof StringType) {
            return $previous;
        }

        $rules = $rule->rule->appliedRules();

        $previous->min = $rules['min'];
        $previous->max = $rules['max'];

        return $previous;
    }
}
