<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use Dedoc\Scramble\Attributes\Endpoint;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Validation\ValidationException;

class SessionController
{
    #[Endpoint(operationId: 'login', title: 'Sign in', description: 'Creates a session, including for unverified accounts. With remember=true the session has a fixed 30-day deadline; otherwise its cookie expires when the browser closes. Both sessions remain subject to server-side expiry and revocation.')]
    public function store(LoginRequest $request): Response
    {
        if (! Auth::guard('web')->attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        $request->session()->regenerate();
        $request->session()->forget('auth.remember_until');
        if ($request->boolean('remember')) {
            $request->session()->put('auth.remember_until', now()->addMinutes(Config::integer('session.remember_lifetime'))->getTimestamp());
        }

        return response()->noContent();
    }

    #[Endpoint(operationId: 'logout', title: 'Sign out')]
    public function destroy(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
