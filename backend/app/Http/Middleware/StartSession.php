<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Session\CacheSessionHandler;
use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession as LaravelStartSession;
use Illuminate\Support\Facades\Config;
use LogicException;
use Symfony\Component\HttpFoundation\Response;

use function is_int;

class StartSession extends LaravelStartSession
{
    protected function startSession(Request $request, $session): Session
    {
        $session = parent::startSession($request, $session);
        $until = $session->get('auth.remember_until');

        // Enforce the deadline before authentication or CSRF validation, even if a cookie is replayed.
        if ($until !== null && (! is_int($until) || $until <= now()->getTimestamp())) {
            $session->invalidate();
            $session->regenerateToken();
        }

        return $session;
    }

    protected function addCookieToResponse(Response $response, Session $session): void
    {
        $handler = $session->getHandler();
        if (! $handler instanceof CacheSessionHandler) {
            throw new LogicException('Caseward sessions require the Valkey session handler.');
        }

        $until = $session->get('auth.remember_until');
        $handler->setLifetime(is_int($until)
            ? max(1, $until - now()->getTimestamp())
            : Config::integer('session.lifetime') * 60);

        parent::addCookieToResponse($response, $session);
        if (is_int($until)) {
            foreach ($response->headers->getCookies() as $cookie) {
                if ($cookie->getName() === $session->getName()) {
                    $response->headers->setCookie($cookie->withExpires($until));
                }
            }
        }
    }
}
