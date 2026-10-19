<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\SendVerificationEmail;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Dedoc\Scramble\Attributes\Endpoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class RegisterController
{
    #[Endpoint(operationId: 'register', title: 'Create an account', description: 'Creates an unverified session. If verification_email_sent is false, the account exists but email delivery failed; use the resend endpoint.')]
    public function __invoke(RegisterRequest $request, SendVerificationEmail $verificationEmail): JsonResponse
    {
        // The unique index also handles requests that pass validation concurrently.
        $user = User::query()->createOrFirst(
            ['email' => $request->string('email')->toString()],
            [
                'name' => $request->string('name')->toString(),
                // Hash untrusted input explicitly; the model cast accepts existing hashes.
                'password' => Hash::make($request->string('password')->toString()),
            ],
        );

        if (! $user->wasRecentlyCreated) {
            throw ValidationException::withMessages([
                'email' => __('validation.unique', ['attribute' => 'email']),
            ]);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return (new UserResource($user))->additional([
            'meta' => ['verification_email_sent' => $verificationEmail->send($user)],
        ])->response()->setStatusCode(201);
    }
}
