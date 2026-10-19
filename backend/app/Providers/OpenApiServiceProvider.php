<?php

declare(strict_types=1);

namespace App\Providers;

use App\OpenApi\DocumentTransformer;
use App\OpenApi\OperationTransformer;
use App\OpenApi\PasswordRule;
use Dedoc\Scramble\Scramble;
use Illuminate\Support\ServiceProvider;

class OpenApiServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Contract tooling is a development dependency, absent from production installs.
        if (! class_exists(Scramble::class)) {
            return;
        }

        Scramble::throwOnError();
        Scramble::configure()
            ->withRuleTransformers(PasswordRule::class)
            ->withOperationTransformers(OperationTransformer::class)
            ->withDocumentTransformers(DocumentTransformer::class);
    }
}
