<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\SendVerificationEmail;
use App\Actions\WithVerificationEmailLimit;
use App\Http\Requests\UpdateEmailRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EmailVerificationController
{
    public function verify(Request $request, string $id, string $hash): Response
    {
        $account = $this->user($request);
        if (! hash_equals((string) $account->id, $id)) {
            abort(response()->json([
                'message' => 'This link belongs to a different account.',
                'code' => 'verification_account_mismatch',
            ], 403));
        }

        $verified = DB::transaction(function () use ($account, $hash): ?User {
            // Lock against verification or address correction in another browser session.
            $user = User::query()->lockForUpdate()->findOrFail($account->id);
            if (! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
                abort(response()->json([
                    'message' => 'This link no longer matches your email address. Request a new email.',
                    'code' => 'verification_email_mismatch',
                ], 403));
            }

            if ($user->hasVerifiedEmail()) {
                return null;
            }

            $user->markEmailAsVerified();

            return $user;
        });

        if ($verified !== null) {
            $request->session()->regenerate(true);
            event(new Verified($verified));
        }

        return response()->noContent();
    }

    public function resend(Request $request, SendVerificationEmail $verificationEmail, WithVerificationEmailLimit $limit): Response
    {
        $user = $this->user($request);

        if ($user->hasVerifiedEmail()) {
            return response()->noContent();
        }

        return $limit->run($user->id, function () use ($user, $verificationEmail): Response {
            if (! $verificationEmail->send($user)) {
                abort(response()->json([
                    'message' => 'We could not send your verification email. Please try again later.',
                    'code' => 'verification_email_unavailable',
                ], 503)->header('Retry-After', (string) Config::integer('verification.resend_interval_seconds')));
            }

            return response()->noContent()->header('Retry-After', (string) Config::integer('verification.resend_interval_seconds'));
        });
    }

    public function update(UpdateEmailRequest $request, SendVerificationEmail $verificationEmail, WithVerificationEmailLimit $limit): UserResource
    {
        $account = $this->user($request);
        if ($request->integer('account_id') !== $account->id) {
            abort(response()->json([
                'message' => 'The signed-in account changed. Reopen the form before trying again.',
                'code' => 'account_context_changed',
            ], 409));
        }

        return $limit->run($account->id, function () use ($request, $account, $verificationEmail): UserResource {
            try {
                $user = DB::transaction(function () use ($request, $account): User {
                    $user = User::query()->lockForUpdate()->findOrFail($account->id);
                    if ($user->hasVerifiedEmail()) {
                        abort(response()->json([
                            'message' => 'A verified email address cannot be corrected here.',
                            'code' => 'email_already_verified',
                        ], 403));
                    }
                    $user->update(['email' => $request->string('email')->toString()]);

                    return $user;
                });
            } catch (UniqueConstraintViolationException) {
                throw ValidationException::withMessages([
                    'email' => __('validation.unique', ['attribute' => 'email']),
                ]);
            }

            return (new UserResource($user))->additional([
                'meta' => ['verification_email_sent' => $verificationEmail->send($user)],
            ]);
        });
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
