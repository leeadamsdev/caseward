<?php

declare(strict_types=1);

use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\PasswordRecoveryController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\SessionController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:5,1,register');

Route::post('/login', [SessionController::class, 'store'])->middleware('throttle:login');

Route::post('/forgot-password', [PasswordRecoveryController::class, 'store'])
    ->middleware('throttle:password-email');
Route::post('/reset-password', [PasswordRecoveryController::class, 'update'])
    ->middleware('throttle:password-reset');

Route::middleware('auth:web')->group(function (): void {
    Route::get('/session', fn (Request $request): UserResource => new UserResource($request->user()))
        ->middleware('cache.headers:private;no_store');
    Route::get('/user', fn (Request $request): UserResource => new UserResource($request->user()))
        ->middleware(['verified', 'cache.headers:private;no_store']);
    Route::post('/logout', [SessionController::class, 'destroy']);

    Route::post('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware(['throttle:6,1,verify-email', 'signed:relative'])->name('verification.verify');
    Route::post('/email/verification-notification', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:10,1,verification-email-requests');
    Route::patch('/email', [EmailVerificationController::class, 'update'])
        ->middleware('throttle:10,1,verification-email-requests');
});
