<?php

declare(strict_types=1);

use App\Http\Middleware\EnsureEmailIsVerified;
use App\Providers\AuthServiceProvider;
use App\Providers\MailServiceProvider;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders([AuthServiceProvider::class, MailServiceProvider::class])
    ->withRouting(api: __DIR__.'/../routes/api.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->throttleWithRedis();
        $middleware->alias(['verified' => EnsureEmailIsVerified::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(fn (InvalidSignatureException $_): JsonResponse => response()->json([
            'message' => 'This verification link is invalid or has expired. Request a new email.',
            'code' => 'invalid_verification_link',
        ], 403));

        $exceptions->render(fn (RedisException|LockTimeoutException $_): JsonResponse => response()->json([
            'message' => 'Service temporarily unavailable. Please try again.',
        ], 503));

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );
    })
    ->create();
