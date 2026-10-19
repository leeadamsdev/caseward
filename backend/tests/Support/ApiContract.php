<?php

declare(strict_types=1);

namespace Tests\Support;

use Illuminate\Testing\TestResponse;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\JsonPointer;
use Opis\JsonSchema\ValidationResult;
use Opis\JsonSchema\Validator;
use PHPUnit\Framework\Assert;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class ApiContract
{
    public readonly stdClass $document;

    public function __construct()
    {
        $json = file_get_contents(base_path('openapi.json'));
        Assert::assertIsString($json);
        $document = json_decode($json, flags: JSON_THROW_ON_ERROR);
        Assert::assertInstanceOf(stdClass::class, $document);
        $this->document = $document;
    }

    /** @param TestResponse<Response> $response */
    public function assertResponse(TestResponse $response, string $method, string $path): void
    {
        $pointer = (string) JsonPointer::createAbsolute(['paths', $path, strtolower($method), 'responses', (string) $response->getStatusCode()]);
        $operationResponse = JsonPointer::parse($pointer)?->data($this->document);
        Assert::assertInstanceOf(stdClass::class, $operationResponse, "Undocumented response: {$method} {$path} {$response->getStatusCode()}");

        if (isset($operationResponse->{'$ref'})) {
            Assert::assertIsString($operationResponse->{'$ref'});
            $operationResponse = JsonPointer::parse(ltrim($operationResponse->{'$ref'}, '#'))?->data($this->document);
            Assert::assertInstanceOf(stdClass::class, $operationResponse);
        }

        $this->assertHeaders($response, $operationResponse);

        if ($response->getStatusCode() === 204) {
            Assert::assertObjectNotHasProperty('content', $operationResponse);
            $response->assertContent('');

            return;
        }

        $schema = JsonPointer::createAbsolute(['content', 'application/json', 'schema'])->data($operationResponse);
        Assert::assertInstanceOf(stdClass::class, $schema, 'A JSON response must declare its schema.');
        $response->assertHeader('Content-Type', 'application/json');
        $json = $response->getContent();
        Assert::assertIsString($json);
        $this->assertValid(json_decode($json, flags: JSON_THROW_ON_ERROR), $schema);
    }

    public function validate(mixed $value, stdClass $schema): ValidationResult
    {
        return (new Validator)->validate($value, (object) [
            '$schema' => 'https://json-schema.org/draft/2020-12/schema',
            'components' => $this->document->components,
            'allOf' => [$schema],
        ]);
    }

    private function assertValid(mixed $value, stdClass $schema): void
    {
        $error = $this->validate($value, $schema)->error();
        Assert::assertNull($error, $error === null ? '' : json_encode((new ErrorFormatter)->format($error), JSON_THROW_ON_ERROR));
    }

    /** @param TestResponse<Response> $response */
    private function assertHeaders(TestResponse $response, stdClass $operationResponse): void
    {
        $headers = $operationResponse->headers ?? new stdClass;
        Assert::assertInstanceOf(stdClass::class, $headers);
        foreach (get_object_vars($headers) as $name => $header) {
            Assert::assertInstanceOf(stdClass::class, $header);
            $value = $response->headers->get($name);
            if (($header->required ?? false) === true) {
                Assert::assertNotNull($value, "Missing required response header: {$name}");
            }
            if ($value === null) {
                continue;
            }
            Assert::assertInstanceOf(stdClass::class, $header->schema);
            // HTTP transports numeric headers as strings; validate their declared scalar type.
            if (($header->schema->type ?? null) === 'integer') {
                $integer = filter_var($value, FILTER_VALIDATE_INT);
                $value = $integer === false ? $value : $integer;
            }
            $this->assertValid($value, $header->schema);
        }
    }
}
