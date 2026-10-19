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
        Schema::create('workspace_invitations', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('email', 254);
            $table->char('token_hash', 64)->unique();
            $table->timestampTz('expires_at');
            $table->timestampTz('last_queued_at')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('revoked_at')->nullable();
            $table->timestampsTz();
            $table->unique(['workspace_id', 'email']);
        });

        DB::statement('ALTER TABLE workspace_invitations ADD CONSTRAINT workspace_invitations_email_normalized CHECK (email = lower(email) AND email = btrim(email))');
        DB::statement('ALTER TABLE workspace_invitations ADD CONSTRAINT workspace_invitations_one_terminal_state CHECK (accepted_at IS NULL OR revoked_at IS NULL)');
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_invitations');
    }
};
