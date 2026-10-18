<?php

declare(strict_types=1);

namespace Tests\Feature\Workspaces;

use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\TestCase;

class CreateWorkspaceTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    public function test_creation_assigns_the_authenticated_owner_and_ignores_untrusted_fields(): void
    {
        $user = $this->user();
        $other = $this->user();
        $this->signIn($user);
        $suppliedId = Str::lower((string) Str::ulid());

        $response = $this->browserRequest('POST', '/api/workspaces', [
            'account_id' => $user->id,
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
            $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $first->id])->assertCreated();
        }
        $second = $this->user();
        $this->signIn($second);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $second->id])->assertCreated();

        $this->assertSame(2, $first->workspaces()->count());
        $this->assertSame(1, $second->workspaces()->count());
        $this->assertDatabaseCount('workspaces', 3);
        $this->assertDatabaseCount('workspace_memberships', 3);
    }

    #[DataProvider('validNames')]
    public function test_valid_names_are_normalized_without_losing_unicode(string $name, string $expected): void
    {
        $user = $this->user();
        $this->signIn($user);
        $this->browserRequest('POST', '/api/workspaces', ['name' => $name, 'account_id' => $user->id])
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
        $user = $this->user();
        $this->signIn($user);
        $this->browserRequest('POST', '/api/workspaces', ['name' => $name, 'account_id' => $user->id])
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
        $user = $this->user();
        $this->signIn($user);
        Config::set('app.debug', false);
        Exceptions::fake();
        $failure = new RuntimeException('Membership storage failed.');
        Event::listen('eloquent.creating: '.WorkspaceMembership::class, static fn () => throw $failure);

        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $user->id])
            ->assertInternalServerError()->assertDontSee($failure->getMessage());

        Exceptions::assertReported(fn (RuntimeException $exception): bool => $exception === $failure);
        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
    }

    public function test_cancelled_membership_creation_does_not_leave_an_orphaned_workspace(): void
    {
        $user = $this->user();
        $this->signIn($user);
        Config::set('app.debug', false);
        Exceptions::fake();
        Event::listen('eloquent.creating: '.WorkspaceMembership::class, static fn (): bool => false);

        $response = $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $user->id]);

        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
        $response->assertInternalServerError();
        Exceptions::assertReported(LogicException::class);
    }

    public function test_creation_requires_csrf_and_rejects_untrusted_origins(): void
    {
        $user = $this->user();
        $this->signIn($user);
        $input = ['name' => 'Acme', 'account_id' => $user->id];
        $this->browserRequest('POST', '/api/workspaces', $input, csrf: false)->assertStatus(419);
        $this->browserRequest('POST', '/api/workspaces', $input, headers: ['Origin' => 'https://attacker.example'])->assertUnauthorized();
        $this->assertDatabaseCount('workspaces', 0);
    }

    public function test_creation_is_rate_limited_per_account_across_browsers_and_ips(): void
    {
        $user = $this->user();
        $this->signIn($user);
        for ($i = 0; $i < 5; $i++) {
            $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $user->id])->assertCreated();
        }
        Redis::purge();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->signIn($user);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $user->id])->assertTooManyRequests()->assertHeader('Retry-After');
        $this->assertDatabaseCount('workspaces', 5);
        $this->browserRequest('GET', '/api/workspaces')->assertOk()->assertJsonPath('meta.total', 5);
        $other = $this->user();
        $this->signIn($other);
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $other->id])->assertCreated();
    }

    public function test_a_stale_form_cannot_create_a_workspace_for_a_different_signed_in_account(): void
    {
        $original = $this->user();
        $this->signIn($original);
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Private project', 'account_id' => $original->id])
            ->assertStatus(409)->assertJsonPath('code', 'account_context_changed');
        $this->assertDatabaseCount('workspaces', 0);
        $this->assertDatabaseCount('workspace_memberships', 0);
    }

    #[DataProvider('invalidAccountContexts')]
    public function test_creation_requires_a_valid_account_context(mixed $accountId): void
    {
        $this->signIn($this->user());
        $this->browserRequest('POST', '/api/workspaces', ['name' => 'Acme', 'account_id' => $accountId])
            ->assertUnprocessable()->assertJsonValidationErrors('account_id');
        $this->assertDatabaseCount('workspaces', 0);
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidAccountContexts(): iterable
    {
        yield 'missing' => [null];
        yield 'zero' => [0];
        yield 'negative' => [-1];
        yield 'array' => [[1]];
        yield 'malformed' => ['unexpected'];
    }
}
