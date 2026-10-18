<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\WorkspaceRole;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\TestCase;

class WorkspaceTest extends TestCase
{
    use InteractsWithBrowserSession;
    use RefreshDatabase;

    public function test_creation_assigns_the_authenticated_owner_and_ignores_untrusted_fields(): void
    {
        $user = $this->user();
        $other = $this->user();
        $this->signIn($user);
        $suppliedId = Str::lower((string) Str::ulid());

        $response = $this->browserRequest('POST', '/api/workspaces', [
            'name' => '  Acme Support  ',
            'id' => $suppliedId,
            'user_id' => $other->id,
            'owner_id' => $other->id,
            'role' => 'member',
            'memberships' => [['user_id' => $other->id, 'role' => 'owner']],
        ])->assertCreated();

        $workspace = Workspace::query()->sole();
        $this->assertTrue(Str::isUlid($workspace->id));
        $this->assertNotSame($suppliedId, $workspace->id);
        $payload = ['data' => ['id' => $workspace->id, 'name' => 'Acme Support', 'role' => 'owner']];
        $response->assertExactJson($payload)
            ->assertHeader('Location', "/api/workspaces/{$workspace->id}");
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control') ?? '');
        $this->assertDatabaseCount('workspace_memberships', 1);
        $this->assertDatabaseHas('workspace_memberships', [
            'workspace_id' => $workspace->id, 'user_id' => $user->id, 'role' => 'owner',
        ]);
        $this->assertTrue($workspace->users()->sole()->is($user));
        $this->browserRequest('GET', "/api/workspaces/{$workspace->id}")->assertOk()->assertExactJson($payload);
    }

    public function test_a_user_can_create_multiple_workspaces_and_names_are_not_globally_unique(): void
    {
        $first = $this->user();
        $this->signIn($first);
        for ($i = 0; $i < 2; $i++) {
            $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])->assertCreated();
        }
        $second = $this->user();
        $this->signIn($second);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])->assertCreated();

        $this->assertSame(2, $first->workspaces()->count());
        $this->assertSame(1, $second->workspaces()->count());
        $this->assertDatabaseCount('workspaces', 3);
        $this->assertDatabaseCount('workspace_memberships', 3);
    }

    #[DataProvider('validNames')]
    public function test_valid_names_are_normalized_without_losing_unicode(string $name, string $expected): void
    {
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => $name])
            ->assertCreated()->assertJsonPath('data.name', $expected);
        $this->assertDatabaseHas('workspaces', ['name' => $expected]);
    }

    /** @return iterable<string, array{string, string}> */
    public static function validNames(): iterable
    {
        yield 'minimum' => ['A', 'A'];
        yield 'maximum unicode length' => [str_repeat('界', 100), str_repeat('界', 100)];
        yield 'unicode whitespace' => ["\u{2003}Équipe 東京 🔧\u{00a0}", 'Équipe 東京 🔧'];
    }

    #[DataProvider('invalidNames')]
    public function test_invalid_names_do_not_create_workspaces_or_memberships(mixed $name): void
    {
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => $name])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidNames(): iterable
    {
        yield 'missing' => [null];
        yield 'empty' => [''];
        yield 'whitespace' => ['   '];
        yield 'unicode whitespace' => ["\u{2003}\u{00a0}"];
        yield 'too long' => [str_repeat('界', 101)];
        yield 'array' => [['Acme']];
        yield 'number' => [123];
        yield 'boolean' => [true];
        yield 'null byte' => ["Acme\0Support"];
        yield 'line break' => ["Acme\nSupport"];
    }

    public function test_membership_failure_rolls_back_the_workspace_and_reports_the_error(): void
    {
        $this->signIn($this->user());
        Config::set('app.debug', false);
        Exceptions::fake();
        $failure = new RuntimeException('Membership storage failed.');
        Event::listen('eloquent.creating: '.WorkspaceMembership::class, static fn () => throw $failure);

        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])
            ->assertInternalServerError()->assertDontSee($failure->getMessage());

        Exceptions::assertReported(fn (RuntimeException $exception): bool => $exception === $failure);
        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
    }

    public function test_cancelled_membership_creation_does_not_leave_an_orphaned_workspace(): void
    {
        $this->signIn($this->user());
        Config::set('app.debug', false);
        Exceptions::fake();
        Event::listen('eloquent.creating: '.WorkspaceMembership::class, static fn (): bool => false);

        $response = $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme']);

        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
        $response->assertInternalServerError();
        Exceptions::assertReported(LogicException::class);
    }

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
    }

    public function test_creation_requires_csrf_and_rejects_untrusted_origins(): void
    {
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'], csrf: false)->assertStatus(419);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'], headers: ['Origin' => 'https://attacker.example'])->assertUnauthorized();
        $this->assertDatabaseCount('workspaces', 0);
    }

    public function test_creation_is_rate_limited_per_account_across_browsers_and_ips(): void
    {
        $user = $this->user();
        $this->signIn($user);
        for ($i = 0; $i < 5; $i++) {
            $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])->assertCreated();
        }
        Redis::purge();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->signIn($user);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertDatabaseCount('workspaces', 5);
        $this->browserRequest('GET', '/api/workspaces')->assertOk()->assertJsonPath('meta.total', 5);
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme'])->assertCreated();
    }

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

    private function user(bool $verified = true): User
    {
        $id = Str::lower((string) Str::ulid());
        $user = User::query()->create(['name' => 'Alex Example', 'email' => "{$id}@example.com", 'password' => 'correct horse battery staple']);
        $user->forceFill(['email_verified_at' => $verified ? now() : null])->save();

        return $user;
    }

    private function workspace(User $owner, string $name = 'Acme'): Workspace
    {
        return $owner->workspaces()->create(['name' => $name], ['role' => WorkspaceRole::Owner]);
    }

    private function signIn(User $user): void
    {
        $this->cookies = [];
        $this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => 'correct horse battery staple'])->assertNoContent();
    }
}
