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
        Schema::create('workspaces', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('name', 100);
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE workspaces ADD CONSTRAINT workspaces_name_valid CHECK (char_length(name) > 0 AND name = btrim(name))');

        Schema::create('workspace_memberships', function (Blueprint $table): void {
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            // Account deletion needs an explicit ownership decision before removing memberships.
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('role', ['owner', 'member']);
            $table->timestampsTz();
            $table->primary(['workspace_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_memberships');
        Schema::dropIfExists('workspaces');
    }
};
