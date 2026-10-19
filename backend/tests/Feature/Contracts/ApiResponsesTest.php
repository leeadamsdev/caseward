<?php

declare(strict_types=1);

namespace Tests\Feature\Contracts;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Concerns\InteractsWithWorkspaces;
use Tests\Fixtures\UserFixture;
use Tests\Support\ApiContract;
use Tests\TestCase;

class ApiResponsesTest extends TestCase
{
    use InteractsWithWorkspaces;
    use RefreshDatabase;

    private ApiContract $contract;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake();
        $this->contract = new ApiContract;
        $this->check($this->browserRequest('GET', '/sanctum/csrf-cookie')->assertNoContent(), 'GET', '/sanctum/csrf-cookie');
    }

    public function test_registration_verification_and_workspace_journey_match_the_contract(): void
    {
        $this->check($this->browserRequest('POST', '/api/register', UserFixture::registration())->assertCreated(), 'POST', '/api/register');
        $user = User::query()->sole();
        $this->check($this->browserRequest('GET', '/api/session')->assertOk(), 'GET', '/api/session');
        $this->check($this->browserRequest('GET', '/api/user')->assertForbidden(), 'GET', '/api/user');
        $this->check($this->browserRequest('GET', '/api/workspaces')->assertForbidden(), 'GET', '/api/workspaces');
        $link = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $user->id, 'hash' => sha1($user->email)], absolute: false);
        $this->check($this->browserRequest('POST', $link)->assertNoContent(), 'POST', '/api/email/verify/{id}/{hash}');
        $this->check($this->browserRequest('GET', '/api/user')->assertOk(), 'GET', '/api/user');
        $this->check($this->browserRequest('GET', '/api/workspaces?page=2')->assertOk(), 'GET', '/api/workspaces');
        $created = $this->browserRequest('POST', '/api/workspaces', ['account_id' => $user->id, 'name' => 'Acme'])->assertCreated();
        $this->check($created, 'POST', '/api/workspaces');
        $location = $created->headers->get('Location');
        $this->assertIsString($location);
        $this->check($this->browserRequest('GET', $location)->assertOk(), 'GET', '/api/workspaces/{workspace}');
        $this->check($this->browserRequest('GET', '/api/workspaces')->assertOk(), 'GET', '/api/workspaces');
        $otherWorkspace = $this->workspace($this->user());
        $this->check($this->browserRequest('GET', "/api/workspaces/{$otherWorkspace->id}")->assertNotFound(), 'GET', '/api/workspaces/{workspace}');
        $this->check($this->browserRequest('POST', '/api/workspaces', ['account_id' => $user->id + 1, 'name' => 'Acme'])->assertConflict(), 'POST', '/api/workspaces');
        $this->check($this->browserRequest('POST', '/api/logout')->assertNoContent(), 'POST', '/api/logout');
        $this->check($this->browserRequest('POST', '/api/login', UserFixture::credentials())->assertNoContent(), 'POST', '/api/login');
    }

    public function test_corrected_email_metadata_and_verification_delivery_responses_match(): void
    {
        $user = $this->user(verified: false);
        $this->signIn($user);
        $this->check($this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id + 1, 'email' => 'corrected@example.com'])->assertConflict(), 'PATCH', '/api/email');
        $this->check($this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'corrected@example.com'])->assertOk(), 'PATCH', '/api/email');
        $this->check($this->browserRequest('POST', '/api/email/verification-notification')->assertTooManyRequests()->assertHeader('Retry-After'), 'POST', '/api/email/verification-notification');
        $user = $this->user();
        $this->signIn($user);
        $this->check($this->browserRequest('PATCH', '/api/email', ['account_id' => $user->id, 'email' => 'another@example.com'])->assertForbidden(), 'PATCH', '/api/email');
    }

    public function test_resend_success_with_and_without_a_delivery_delay_matches(): void
    {
        $user = $this->user(verified: false);
        $this->signIn($user);
        $this->check($this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent()->assertHeader('Retry-After'), 'POST', '/api/email/verification-notification');
        $user->markEmailAsVerified();
        $this->check($this->browserRequest('POST', '/api/email/verification-notification')->assertNoContent()->assertHeaderMissing('Retry-After'), 'POST', '/api/email/verification-notification');
    }

    public function test_failed_delivery_matches_without_losing_recoverable_registration_metadata(): void
    {
        Exceptions::fake();
        Notification::shouldReceive('send')->twice()->andThrow(new TransportException('Delivery failed.'));
        $this->check($this->browserRequest('POST', '/api/register', UserFixture::registration())->assertCreated()->assertJsonPath('meta.verification_email_sent', false), 'POST', '/api/register');
        $this->check($this->browserRequest('POST', '/api/email/verification-notification')->assertServiceUnavailable()->assertHeader('Retry-After'), 'POST', '/api/email/verification-notification');
    }

    public function test_password_recovery_success_and_both_422_variants_match(): void
    {
        $this->check($this->browserRequest('POST', '/api/forgot-password', ['email' => 'absent@example.com'])->assertAccepted(), 'POST', '/api/forgot-password');
        $user = UserFixture::create();
        $token = Password::createToken($user);
        $payload = ['email' => $user->email, 'token' => $token, 'password' => 'a new correct horse battery staple', 'password_confirmation' => 'a new correct horse battery staple'];
        $this->check($this->browserRequest('POST', '/api/reset-password', [...$payload, 'password_confirmation' => 'wrong'])->assertUnprocessable(), 'POST', '/api/reset-password');
        $this->check($this->browserRequest('POST', '/api/reset-password', $payload)->assertNoContent(), 'POST', '/api/reset-password');
        $this->check($this->browserRequest('POST', '/api/reset-password', $payload)->assertUnprocessable()->assertJsonPath('code', 'invalid_password_reset_link'), 'POST', '/api/reset-password');
    }

    /** @param array<string, mixed> $data */
    #[DataProvider('invalidRequests')]
    public function test_request_failures_match(string $method, string $path, array $data, int $status, bool $csrf): void
    {
        $this->check($this->browserRequest($method, $path, $data, csrf: $csrf)->assertStatus($status), $method, $path);
    }

    /** @return iterable<string, array{string, string, array<string, mixed>, int, bool}> */
    public static function invalidRequests(): iterable
    {
        yield 'missing authentication' => ['GET', '/api/session', [], 401, true];
        yield 'missing CSRF' => ['POST', '/api/register', UserFixture::registration(), 419, false];
        yield 'registration validation' => ['POST', '/api/register', [], 422, true];
        yield 'wrong credentials' => ['POST', '/api/login', UserFixture::credentials(), 422, true];
        yield 'recovery validation' => ['POST', '/api/forgot-password', ['email' => 'invalid'], 422, true];
    }

    /** @param TestResponse<Response> $response */
    private function check(TestResponse $response, string $method, string $path): void
    {
        $this->contract->assertResponse($response, $method, $path);
    }
}
