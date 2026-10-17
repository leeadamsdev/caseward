<?php

declare(strict_types=1);

use App\Http\Controllers\RegisterController;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:5,1,register');
