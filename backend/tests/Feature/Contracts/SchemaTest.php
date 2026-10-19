<?php

declare(strict_types=1);

namespace Tests\Feature\Contracts;

use Opis\JsonSchema\JsonPointer;
use PHPUnit\Framework\Attributes\DataProvider;
use stdClass;
use Tests\Support\ApiContract;
use Tests\TestCase;

class SchemaTest extends TestCase
{
    #[DataProvider('workspacePayloads')]
    public function test_workspace_schema_enforces_identifiers_and_roles(string $id, string $role, bool $valid): void
    {
        $contract = new ApiContract;
        $result = $contract->validate((object) ['id' => $id, 'name' => 'Acme', 'role' => $role], (object) [
            '$ref' => '#/components/schemas/WorkspaceResource',
        ]);
        $this->assertSame($valid, $result->isValid());
    }

    /** @return iterable<string, array{string, string, bool}> */
    public static function workspacePayloads(): iterable
    {
        yield 'owner' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'owner', true];
        yield 'member with lowercase ULID' => ['01arz3ndektsv4rrffq69g5fav', 'member', true];
        yield 'non-ULID identifier' => ['not-a-workspace-id', 'owner', false];
        yield 'ULID overflow' => ['81ARZ3NDEKTSV4RRFFQ69G5FAV', 'owner', false];
        yield 'unknown role' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'admin', false];
    }

    #[DataProvider('serviceUnavailablePayloads')]
    public function test_service_outages_and_coded_queue_failures_are_described_together(?string $code, bool $valid): void
    {
        $contract = new ApiContract;
        $schema = JsonPointer::createAbsolute(['paths', '/api/email/verification-notification', 'post', 'responses', '503', 'content', 'application/json', 'schema'])->data($contract->document);
        $this->assertInstanceOf(stdClass::class, $schema);
        $payload = ['message' => 'Temporarily unavailable.'];
        if ($code !== null) {
            $payload['code'] = $code;
        }
        $this->assertSame($valid, $contract->validate((object) $payload, $schema)->isValid());
    }

    /** @return iterable<string, array{?string, bool}> */
    public static function serviceUnavailablePayloads(): iterable
    {
        yield 'service outage without a code' => [null, true];
        yield 'queue submission failure' => ['verification_queue_unavailable', true];
        yield 'undocumented error code' => ['unknown_failure', false];
    }
}
