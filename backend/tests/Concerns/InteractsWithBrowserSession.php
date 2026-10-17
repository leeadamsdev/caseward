<?php

declare(strict_types=1);

namespace Tests\Concerns;

use Illuminate\Support\Facades\Auth;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

trait InteractsWithBrowserSession
{
    /** @var array<string, string> */
    protected array $cookies = [];

    protected function setUpInteractsWithBrowserSession(): void
    {
        // Exercise real CSRF checks, which Laravel normally skips during tests.
        $this->app->instance('env', 'local');
        $this->withHeader('Origin', 'http://localhost:5173')->withCredentials();
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, string>  $headers
     * @return TestResponse<Response>
     */
    protected function browserRequest(string $method, string $uri, array $data = [], bool $csrf = true, array $headers = []): TestResponse
    {
        // Carry browser cookies, but resolve fresh authentication and session state.
        Auth::forgetGuards();
        $this->app->forgetInstance('session.store');
        $this->app->make('session')->forgetDrivers();
        $this->unencryptedCookies = $this->cookies;

        $response = $this->json($method, $uri, $data, [
            'X-XSRF-TOKEN' => $csrf ? ($this->cookies['XSRF-TOKEN'] ?? '') : '',
            ...$headers,
        ]);

        foreach ($response->headers->getCookies() as $cookie) {
            $this->cookies[$cookie->getName()] = $cookie->getValue() ?? '';
        }

        return $response;
    }
}
