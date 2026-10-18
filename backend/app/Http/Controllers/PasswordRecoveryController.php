<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\RecoverPassword;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Jobs\RequestPasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Bus;

class PasswordRecoveryController
{
    public function store(ForgotPasswordRequest $request): JsonResponse
    {
        // Enqueue before looking up the address so response timing does not depend on account existence or delivery.
        Bus::dispatch(new RequestPasswordReset($request->string('email')->toString()));

        return response()->json([
            'message' => 'If an account matches that email address, we will send a password reset link.',
        ], 202, ['Cache-Control' => 'no-store, private']);
    }

    public function update(ResetPasswordRequest $request, RecoverPassword $recovery): Response|JsonResponse
    {
        if (! $recovery->reset(
            $request->string('email')->toString(),
            $request->string('token')->toString(),
            $request->string('password')->toString(),
        )) {
            return response()->json([
                'message' => 'This password reset link is invalid or has expired. Request a new link.',
                'code' => 'invalid_password_reset_link',
            ], 422, ['Cache-Control' => 'no-store, private']);
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
