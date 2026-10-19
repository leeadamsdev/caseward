<?php

declare(strict_types=1);

use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\PasswordRecoveryController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\WorkspaceInvitationController;
use App\Http\Controllers\WorkspaceMemberController;
use App\Http\Resources\UserResource;
use Dedoc\Scramble\Attributes\Endpoint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:5,1,register');

Route::post('/login', [SessionController::class, 'store'])->middleware('throttle:login');

Route::post('/forgot-password', [PasswordRecoveryController::class, 'store'])
    ->middleware('throttle:password-email');
Route::post('/reset-password', [PasswordRecoveryController::class, 'update'])
    ->middleware('throttle:password-reset');

Route::middleware('auth:web')->group(function (): void {
    Route::get('/session', #[Endpoint(operationId: 'getSession')] fn (Request $request): UserResource => new UserResource($request->user()))
        ->middleware('cache.headers:private;no_store');
    Route::get('/user', #[Endpoint(operationId: 'getUser')] fn (Request $request): UserResource => new UserResource($request->user()))
        ->middleware(['verified', 'cache.headers:private;no_store']);
    Route::post('/logout', [SessionController::class, 'destroy']);

    Route::middleware(['verified', 'cache.headers:private;no_store'])->group(function (): void {
        Route::get('/workspaces', [WorkspaceController::class, 'index']);
        Route::post('/workspaces', [WorkspaceController::class, 'store'])->middleware('throttle:5,1,create-workspace');
        Route::get('/workspaces/{workspace}', [WorkspaceController::class, 'show'])
            ->whereUlid('workspace')->name('workspaces.show');
        Route::get('/workspaces/{workspace}/members', [WorkspaceMemberController::class, 'index'])
            ->whereUlid('workspace');

        Route::prefix('/workspaces/{workspace}/invitations')->whereUlid('workspace')->group(function (): void {
            Route::get('/', [WorkspaceInvitationController::class, 'index']);
            Route::post('/', [WorkspaceInvitationController::class, 'store'])->middleware('throttle:workspace-invitations');
            Route::post('/{invitation}/resend', [WorkspaceInvitationController::class, 'resend'])
                ->whereUlid('invitation')->middleware('throttle:workspace-invitations');
            Route::delete('/{invitation}', [WorkspaceInvitationController::class, 'destroy'])
                ->whereUlid('invitation')->middleware('throttle:30,1,revoke-invitation');
        });
        Route::get('/invitations/{token}', [WorkspaceInvitationController::class, 'show'])
            ->where('token', '[a-f0-9]{64}')->middleware('throttle:30,1,preview-invitation');
        Route::post('/invitations/{token}/accept', [WorkspaceInvitationController::class, 'accept'])
            ->where('token', '[a-f0-9]{64}')->middleware('throttle:20,1,accept-invitation');
    });

    Route::post('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware(['throttle:6,1,verify-email', 'signed:relative'])->name('verification.verify');
    Route::post('/email/verification-notification', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:10,1,verification-email-requests');
    Route::patch('/email', [EmailVerificationController::class, 'update'])
        ->middleware('throttle:10,1,verification-email-requests');
});
