<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class RegisterController
{
    public function __invoke(RegisterRequest $request): JsonResponse
    {
        // The unique index also handles requests that pass validation concurrently.
        $user = User::query()->createOrFirst(
            ['email' => $request->string('email')->toString()],
            [
                'name' => $request->string('name')->toString(),
                'password' => Hash::make($request->string('password')->toString()),
            ],
        );

        if (! $user->wasRecentlyCreated) {
            throw ValidationException::withMessages([
                'email' => __('validation.unique', ['attribute' => 'email']),
            ]);
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ], 201);
    }
}
