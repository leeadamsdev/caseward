<?php

declare(strict_types=1);

namespace App\OpenApi;

use Dedoc\Scramble\Contracts\DocumentTransformer as Transformer;
use Dedoc\Scramble\OpenApiContext;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\SecuritySchemes\ApiKeySecurityScheme;
use Dedoc\Scramble\Support\Generator\Server;
use Dedoc\Scramble\Support\Generator\Types\ObjectType;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Illuminate\Support\Facades\Config;

class DocumentTransformer implements Transformer
{
    public function handle(OpenApi $document, OpenApiContext $_): void
    {
        // Keep exports identical across local development, CI and deployment hosts.
        $document->servers = [new Server('/')];
        $document->info->description = 'Caseward browser API. Send Accept: application/json and include cookies. '
            .'First GET /sanctum/csrf-cookie, then send the URL-decoded XSRF-TOKEN cookie as X-XSRF-TOKEN on writes. '
            .'Refresh that cookie after session changes. Unverified accounts can access /api/session and verification routes; '
            .'workspace routes and /api/user require a verified email. Frontend-origin requests must match the configured Sanctum stateful domains.';
        $document->components->addSecurityScheme('session', (new ApiKeySecurityScheme('cookie', Config::string('session.cookie')))
            ->setDescription('HttpOnly browser session cookie, issued by the CSRF bootstrap and renewed at sign-in.'));
        $document->components->addSecurityScheme('csrf', (new ApiKeySecurityScheme('header', 'X-XSRF-TOKEN'))
            ->setDescription('URL-decoded XSRF-TOKEN cookie. Required with the matching session cookie for stateful writes.'));

        $workspace = $document->components->schemas['WorkspaceResource'] ?? null;
        if ($workspace instanceof Schema && $workspace->type instanceof ObjectType) {
            $workspace->type->properties['id'] = (new StringType)->pattern('^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$');
        }
    }
}
