<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email', 254)->unique();
            $table->timestampTz('email_verified_at')->nullable();
            $table->string('password');
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(email) AND email = btrim(email))');
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
