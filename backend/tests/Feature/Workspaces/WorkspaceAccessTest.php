<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces;

use App\Enums\WorkspaceRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class WorkspaceAccessTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_listing_is_paginated_and_contains_only_the_current_users_memberships(): void
    {
        $owner = $this->user();
        $member = $this->user();
        $hidden = $this->workspace($owner, 'Private workspace');
        $shared = $this->workspace($owner, 'A shared workspace');
        $shared->users()->attach($member, ['role' => WorkspaceRole::Member]);
        $ownedIds = [];
        for ($i = 0; $i < 25; $i++) {
            $ownedIds[] = $this->workspace($member, 'Same name')->id;
        }
        sort($ownedIds);
        $expectedIds = [$shared->id, ...$ownedIds];
        $this->signIn($member);

        $first = $this->browserRequest('GET', '/api/workspaces')->assertOk()
            ->assertJsonCount(25, 'data')->assertJsonPath('meta.total', 26)
            ->assertJsonPath('meta.per_page', 25)->assertJsonPath('data.0.id', $shared->id)
            ->assertJsonPath('data.0.role', 'member')->assertDontSee($hidden->id);
        $this->assertStringContainsString('no-store', $first->headers->get('Cache-Control') ?? '');
        $first->assertJsonPath('data.*.id', array_slice($expectedIds, 0, 25));
        $this->browserRequest('GET', '/api/workspaces?page=2')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.*.id', array_slice($expectedIds, 25));
    }

    public function test_a_verified_user_without_memberships_receives_an_empty_list(): void
    {
        $this->signIn($this->user());
        $this->browserRequest('GET', '/api/workspaces')->assertOk()
            ->assertJsonPath('data', [])->assertJsonPath('meta.total', 0);
    }

    public function test_owner_and_member_access_is_scoped_per_request_and_revoked_membership_stops_access(): void
    {
        $owner = $this->user();
        $member = $this->user();
        $private = $this->workspace($owner, 'Private customer operations');
        $shared = $this->workspace($owner, 'Shared support');
        $shared->users()->attach($member, ['role' => WorkspaceRole::Member]);
        $this->signIn($owner);
        $this->browserRequest('GET', "/api/workspaces/{$private->id}")->assertOk()->assertJsonPath('data.role', 'owner');
        $ownerCookies = $this->cookies;

        $this->signIn($member);
        $this->browserRequest('GET', "/api/workspaces/{$shared->id}")->assertOk()
            ->assertExactJson(['data' => ['id' => $shared->id, 'name' => $shared->name, 'role' => 'member']]);
        $this->browserRequest('GET', "/api/workspaces/{$private->id}")->assertNotFound()->assertDontSee($private->name);
        $unknown = Str::lower((string) Str::ulid());
        $this->browserRequest('GET', "/api/workspaces/{$unknown}")->assertNotFound();
        $this->browserRequest('GET', '/api/workspaces/not-an-id')->assertNotFound();

        $shared->users()->detach($member);
        $this->browserRequest('GET', "/api/workspaces/{$shared->id}")->assertNotFound();
        $this->browserRequest('GET', '/api/workspaces')->assertOk()->assertJsonPath('meta.total', 0);
        $this->cookies = $ownerCookies;
        $this->browserRequest('GET', "/api/workspaces/{$shared->id}")->assertOk();
    }

    public function test_renaming_a_workspace_preserves_its_url(): void
    {
        $owner = $this->user();
        $workspace = $this->workspace($owner);
        $this->signIn($owner);
        $workspace->update(['name' => 'Renamed support']);

        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}")->assertOk()
            ->assertJsonPath('data.id', $workspace->id)->assertJsonPath('data.name', 'Renamed support');
    }

    #[DataProvider('workspaceEndpoints')]
    public function test_guests_and_unverified_users_cannot_access_workspace_endpoints(string $method, string $path): void
    {
        $unverified = $this->user(verified: false);
        $workspace = $this->workspace($unverified);
        $path = str_replace('{id}', $workspace->id, $path);
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest($method, $path, ['name' => 'New workspace'])->assertUnauthorized();
        $this->signIn($unverified);
        $this->browserRequest($method, $path, ['name' => 'New workspace'])
            ->assertForbidden()->assertJsonPath('code', 'email_unverified');

        $this->assertDatabaseCount('workspaces', 1);
        $this->assertDatabaseCount('workspace_memberships', 1);
    }

    /** @return iterable<string, array{string, string}> */
    public static function workspaceEndpoints(): iterable
    {
        yield 'create' => ['POST', '/api/workspaces'];
        yield 'list' => ['GET', '/api/workspaces'];
        yield 'show' => ['GET', '/api/workspaces/{id}'];
        yield 'members' => ['GET', '/api/workspaces/{id}/members'];
    }
}
