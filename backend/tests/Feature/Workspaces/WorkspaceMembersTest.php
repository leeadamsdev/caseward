<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces;

use App\Enums\WorkspaceRole;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class WorkspaceMembersTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    #[DataProvider('readerRoles')]
    public function test_owners_and_members_can_read_only_the_requested_workspaces_member_profiles(WorkspaceRole $role): void
    {
        $owner = $this->user();
        $member = $this->user();
        $workspace = $this->workspace($owner);
        $workspace->users()->attach($member, ['role' => WorkspaceRole::Member]);
        $this->workspace($member, 'A different workspace they own');
        $outsider = $this->user();
        $this->workspace($outsider, 'Private workspace');
        $this->signIn($role === WorkspaceRole::Owner ? $owner : $member);

        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/members")
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data', [
                ['id' => $owner->id, 'name' => $owner->name, 'email' => $owner->email, 'role' => 'owner'],
                ['id' => $member->id, 'name' => $member->name, 'email' => $member->email, 'role' => 'member'],
            ])
            ->assertJsonPath('meta.total', 2)
            ->assertDontSee($outsider->email)
            ->assertDontSee($owner->password)
            ->assertDontSee('email_verified');
    }

    /** @return iterable<string, array{WorkspaceRole}> */
    public static function readerRoles(): iterable
    {
        foreach (WorkspaceRole::cases() as $role) {
            yield $role->value => [$role];
        }
    }

    public function test_pagination_is_bounded_stably_ordered_and_does_not_add_per_member_queries(): void
    {
        $owner = $this->user();
        $owner->update(['name' => 'A workspace owner']);
        $workspace = $this->workspace($owner);
        $ids = [$owner->id];
        for ($i = 0; $i < 27; $i++) {
            $member = $this->user();
            $member->update(['name' => 'Same name']);
            $workspace->users()->attach($member, ['role' => WorkspaceRole::Member]);
            $ids[] = $member->id;
        }
        $this->signIn($owner);
        $queryCount = 0;
        DB::listen(static function (QueryExecuted $_) use (&$queryCount): void {
            $queryCount++;
        });

        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/members?per_page=1000")
            ->assertOk()->assertJsonCount(25, 'data')
            ->assertJsonPath('data.*.id', array_slice($ids, 0, 25))
            ->assertJsonPath('meta.total', 28)->assertJsonPath('meta.per_page', 25)
            ->assertJsonPath('meta.last_page', 2);
        $fullPageQueryCount = $queryCount;
        $queryCount = 0;
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/members?page=2")
            ->assertOk()->assertJsonCount(3, 'data')
            ->assertJsonPath('data.*.id', array_slice($ids, 25))
            ->assertJsonPath('meta.current_page', 2);
        $this->assertSame($fullPageQueryCount, $queryCount, 'Member count must not increase the number of queries.');
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}/members?page=99")
            ->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total', 28);
    }

    public function test_outsiders_unknown_workspaces_and_revoked_memberships_are_indistinguishable(): void
    {
        Config::set('app.debug', false);
        $owner = $this->user();
        $member = $this->user();
        $workspace = $this->workspace($owner, 'Private customer operations');
        $this->workspace($member);
        $this->signIn($member);
        $path = "/api/workspaces/{$workspace->id}/members";
        $this->browserRequest('GET', $path)->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
        $unknown = (string) Str::ulid();
        $this->browserRequest('GET', "/api/workspaces/{$unknown}/members")
            ->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
        $this->browserRequest('GET', '/api/workspaces/not-an-id/members')->assertNotFound();

        $workspace->users()->attach($member, ['role' => WorkspaceRole::Member]);
        $this->browserRequest('GET', $path)->assertOk()->assertJsonPath('meta.total', 2);
        $workspace->users()->detach($member);
        $this->browserRequest('GET', $path)->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
    }

    public function test_authentication_and_email_verification_run_before_workspace_lookup(): void
    {
        $unverified = $this->user(verified: false);
        $workspace = $this->workspace($unverified);
        $unknown = (string) Str::ulid();
        foreach ([$workspace->id, $unknown] as $id) {
            $this->browserRequest('GET', "/api/workspaces/{$id}/members")->assertUnauthorized();
        }
        $this->signIn($unverified);
        foreach ([$workspace->id, $unknown] as $id) {
            $this->browserRequest('GET', "/api/workspaces/{$id}/members")->assertForbidden()->assertExactJson([
                'message' => 'Verify your email address before continuing.',
                'code' => 'email_unverified',
            ]);
        }
    }
}
