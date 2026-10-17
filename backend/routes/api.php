<?php

declare(strict_types=1);

use App\Http\Controllers\RegisterController;
use App\Http\Controllers\SessionController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:5,1,register');

Route::post('/login', [SessionController::class, 'store'])->middleware('throttle:5,1,login');

Route::middleware('auth:web')->group(function (): void {
    Route::get('/user', fn (Request $request): UserResource => new UserResource($request->user()))
        ->middleware('cache.headers:private;no_store');
    Route::post('/logout', [SessionController::class, 'destroy']);
});
