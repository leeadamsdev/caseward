<?php

declare(strict_types=1);

namespace Tests\Feature\PasswordRecovery;

use App\Actions\RecoverPassword;
use App\Notifications\PasswordResetConfirmationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\Concerns\InteractsWithBrowserSession;
use Tests\Concerns\InteractsWithPasswordRecovery;
use Tests\Fixtures\UserFixture;
use Tests\TestCase;

class ResetConfirmationTest extends TestCase
{
    use InteractsWithBrowserSession;
    use InteractsWithPasswordRecovery;
    use RefreshDatabase;

    public function test_only_a_successful_reset_sends_one_confirmation_to_the_account_address(): void
    {
        $this->freezeTime();
        $user = UserFixture::create();
        $token = $this->token($user);
        Notification::fake();

        $this->browserRequest('POST', '/api/reset-password', $this->reset(str_repeat('a', 64)))->assertUnprocessable();
        Notification::assertNothingSent();
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
        Notification::assertSentOnDemand(PasswordResetConfirmationNotification::class,
            fn (PasswordResetConfirmationNotification $notification, array $channels, AnonymousNotifiable $notifiable): bool => $notifiable->routeNotificationFor('mail') === $user->email
                && $channels === ['mail']
                && $notification->resetAt->equalTo(now())
        );
        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertUnprocessable();
        Notification::assertSentOnDemandOnce(PasswordResetConfirmationNotification::class);
        Notification::assertCount(1);
    }

    public function test_confirmation_waits_for_commit_and_is_discarded_on_rollback(): void
    {
        $user = UserFixture::create();
        $hash = $user->password;
        $token = $this->token($user);
        Notification::fake();
        DB::beginTransaction();
        $this->assertTrue($this->app->make(RecoverPassword::class)->reset($user->email, $token, $this->newPassword()));
        Notification::assertNothingSent();
        DB::rollBack();
        Notification::assertNothingSent();
        $this->assertSame($hash, $user->refresh()->password);
    }

    public function test_a_confirmation_dispatch_failure_is_reported_without_failing_the_completed_reset(): void
    {
        $user = UserFixture::create();
        $token = $this->token($user);
        Exceptions::fake();
        $failure = new RuntimeException('Notification queue is unavailable.');
        $queue = $this->queue();
        Notification::swap(new ChannelManager($this->app));
        Queue::partialMock()->shouldReceive('connection')->with(null)->once()->andThrow($failure);

        $this->browserRequest('POST', '/api/reset-password', $this->reset($token))->assertNoContent();
        $this->assertTrue(Hash::check($this->newPassword(), $user->refresh()->password));
        $this->assertFalse(Password::tokenExists($user, $token));
        $this->assertSame(0, $queue->size());
        $this->assertGuest();
        Exceptions::assertReported(fn (RuntimeException $exception): bool => $exception === $failure);
        Exceptions::assertReportedCount(1);
    }
}
