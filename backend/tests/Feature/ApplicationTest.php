<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class ApplicationTest extends TestCase
{
    public function test_the_application_namespace_can_be_detected(): void
    {
        $this->assertSame('App\\', $this->app->getNamespace());
    }

    public function test_the_health_check_succeeds(): void
    {
        $this->getJson('/up')
            ->assertOk()
            ->assertExactJson(['status' => 'up']);
    }
}
