<?php

declare(strict_types=1);

namespace App\OpenApi;

use Dedoc\Scramble\Contracts\OperationTransformer as Transformer;
use Dedoc\Scramble\Support\Generator\Combined\AnyOf;
use Dedoc\Scramble\Support\Generator\Header;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\SecurityRequirement;
use Dedoc\Scramble\Support\Generator\Types\IntegerType;
use Dedoc\Scramble\Support\Generator\Types\ObjectType;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Dedoc\Scramble\Support\Generator\Types\Type;
use Dedoc\Scramble\Support\RouteInfo;

use function is_string;

class OperationTransformer implements Transformer
{
    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        $middleware = $routeInfo->route->gatherMiddleware();
        $authenticated = in_array('auth:web', $middleware, true);
        $write = ! in_array($operation->method, ['get', 'head', 'options'], true);
        $security = $authenticated ? ['session' => []] : [];
        if ($write) {
            $security += ['session' => [], 'csrf' => []];
            $operation->addResponse($this->error(419, 'CSRF token mismatch. Refresh the CSRF cookie and retry.'));
        }
        $operation->security = $security === [] ? [] : [new SecurityRequirement($security)];

        if (in_array('verified', $middleware, true)) {
            $forbidden = $this->error(403, 'Email verification or operation permission required.', 'email_unverified');
            foreach ($operation->responses ?? [] as $response) {
                $response = $response instanceof Reference ? $response->resolve() : $response;
                if (! $response instanceof Response || $response->code !== 403) {
                    continue;
                }
                $content = $response->getContent('application/json');
                $base = $forbidden->getContent('application/json');
                if ($content instanceof Schema && $content->type instanceof ObjectType
                    && $base instanceof Schema && $base->type instanceof ObjectType) {
                    $code = $content->type->properties['code'] ?? null;
                    if ($code instanceof Type) {
                        $codes = new AnyOf;
                        $codes->setItems([$base->type->properties['code'], $code]);
                        $base->type->properties['code'] = $codes;
                    }
                    if (! in_array('code', $content->type->required, true)) {
                        $base->type->required = ['message'];
                    }
                }
            }
            $operation->addResponse($forbidden);
        }

        if (array_any($middleware, fn (mixed $name): bool => is_string($name) && str_starts_with($name, 'throttle:'))) {
            $seconds = new IntegerType;
            $seconds->min = 0;
            $operation->addResponse($this->error(429, 'Too many attempts. Retry after the indicated number of seconds.')
                ->addHeader('Retry-After', new Header(required: true, schema: $this->schema($seconds))));
        }

        $unavailable = $this->error(503, 'Session, rate limiter, queue or email delivery temporarily unavailable.');
        foreach ($operation->responses ?? [] as $response) {
            $response = $response instanceof Reference ? $response->resolve() : $response;
            if ($response instanceof Response && $response->code === 503) {
                $content = $response->getContent('application/json');
                $base = $unavailable->getContent('application/json');
                if ($content instanceof Schema && $content->type instanceof ObjectType
                    && $base instanceof Schema && $base->type instanceof ObjectType
                    && isset($content->type->properties['code'])) {
                    // An optional code preserves delivery errors without a broad union masking them.
                    $base->type->properties['code'] = $content->type->properties['code'];
                }
                foreach ($response->headers as $name => $header) {
                    if ($header instanceof Header) {
                        $unavailable->addHeader($name, (clone $header)->setRequired(false));
                    }
                }
            }
        }
        $operation->addResponse($unavailable);

        foreach ($operation->responses ?? [] as $response) {
            if ($response instanceof Response && $response->code === 204) {
                $response->content = [];
                $response->description = 'No content';
            }
        }

        if ($routeInfo->route->uri() === 'sanctum/csrf-cookie') {
            $operation->operationId = 'csrfCookie';
            $operation->summary = 'Initialize the browser session and CSRF cookies';
            $operation->tags = ['Session'];
        }
    }

    private function error(int $status, string $description, ?string $code = null): Response
    {
        $type = new ObjectType;
        $type->properties = ['message' => new StringType];
        $type->required = ['message'];
        if ($code !== null) {
            $type->properties['code'] = (new StringType)->const($code);
            $type->required[] = 'code';
        }

        return Response::make($status)->setDescription($description)->setContent('application/json', $this->schema($type));
    }

    private function schema(Type $type): Schema
    {
        $schema = new Schema;
        $schema->type = $type;

        return $schema;
    }
}
