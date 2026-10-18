<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class WorkspaceConstraintsTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    #[DataProvider('invalidMemberships')]
    public function test_the_database_enforces_membership_invariants(string $case): void
    {
        $user = $this->user();
        $workspace = $this->workspace($user);
        $membership = ['workspace_id' => $workspace->id, 'user_id' => $user->id, 'role' => 'owner'];
        if ($case === 'workspace') {
            $membership['workspace_id'] = Str::lower((string) Str::ulid());
        } elseif ($case === 'user') {
            $membership['user_id'] = $user->id + 1000;
        } elseif ($case === 'role') {
            $membership['user_id'] = $this->user()->id;
            $membership['role'] = 'administrator';
        }

        $this->expectException(QueryException::class);
        DB::table('workspace_memberships')->insert($membership);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidMemberships(): iterable
    {
        yield 'duplicate membership' => ['duplicate'];
        yield 'missing workspace' => ['workspace'];
        yield 'missing user' => ['user'];
        yield 'unsupported role' => ['role'];
    }

    #[DataProvider('invalidStoredNames')]
    public function test_the_database_rejects_invalid_stored_workspace_names(string $name): void
    {
        $this->expectException(QueryException::class);
        DB::table('workspaces')->insert(['id' => Str::lower((string) Str::ulid()), 'name' => $name]);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidStoredNames(): iterable
    {
        yield 'blank' => [''];
        yield 'unnormalized' => [' Acme '];
        yield 'too long' => [str_repeat('界', 101)];
    }

    public function test_account_deletion_cannot_silently_orphan_a_workspace(): void
    {
        $owner = $this->user();
        $this->workspace($owner);
        $this->expectException(QueryException::class);
        $owner->delete();
    }

    public function test_workspace_deletion_removes_its_memberships(): void
    {
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $workspace->delete();
        $this->assertDatabaseCount('workspace_memberships', 0);
        $this->assertModelExists($owner);
    }
}
