import assert from "node:assert/strict";
import { test } from "node:test";
import {
    apiRequest,
    isRecord,
    requiredFields,
    responseBody,
    retryWindow,
    validationErrors,
} from "../../app/lib/api.ts";

await test("only objects are accepted as response records", () => {
    for (const value of [null, undefined, [], "text", 3, true])
        assert.equal(isRecord(value), false);
    assert.equal(isRecord({ errors: {} }), true);
});

await test("validation errors accept only nonempty string arrays for known fields", () => {
    const fields = [{ name: "email" }, { name: "password" }] as const;
    assert.deepEqual(
        validationErrors(
            {
                errors: {
                    email: ["Invalid email"],
                    password: [""],
                    private: ["Diagnostic"],
                },
            },
            fields,
        ),
        { email: ["Invalid email"] },
    );
    for (const errors of [
        null,
        [],
        { email: [] },
        { email: [7] },
        { email: ["   "] },
        { email: ["Valid", null] },
    ]) {
        assert.equal(validationErrors({ errors }, fields), undefined);
    }
});

await test("required fields preserve password spaces and reject blank text and uploaded files", () => {
    const form = new FormData();
    form.set("email", "  ");
    form.set("password", "  ");
    form.set("name", new File(["untrusted"], "name.txt"));
    const result = requiredFields(form, [
        { name: "email", label: "Email", type: "email" },
        { name: "password", label: "Password", type: "password" },
        { name: "name", label: "Name", type: "text" },
    ]);
    assert.deepEqual(result.values, { email: "  ", password: "  ", name: "" });
    assert.deepEqual(result.errors, {
        email: ["Email is required."],
        name: ["Name is required."],
    });
});

const now = Date.parse("2026-10-17T12:00:00Z");
for (const [header, delay] of [
    ["3601", 3_601_000],
    ["0", 0],
    ["Sat, 17 Oct 2026 12:01:01 GMT", 61_000],
    ["Sat, 17 Oct 2026 11:59:59 GMT", 0],
    [null, 60_000],
    ["invalid", 60_000],
    ["9".repeat(400), 60_000],
] as const) {
    await test(`Retry-After ${header?.slice(0, 40) ?? "missing"} has a bounded retry window`, (context) => {
        context.mock.method(Date, "now", () => now);
        const headers = header === null ? {} : { "Retry-After": header };
        assert.deepEqual(retryWindow(new Response(null, { headers })), {
            receivedAt: now,
            retryAt: now + delay,
        });
    });
}

await test("malformed response JSON is rejected without exposing the response", async () => {
    assert.equal(
        await responseBody(new Response("<html>Private diagnostic</html>")),
        undefined,
    );
    assert.deepEqual(await responseBody(Response.json({ data: 1 })), {
        data: 1,
    });
});

await test("API requests enforce credentials, JSON acceptance and uncached responses", async (context) => {
    const response = new Response(null, { status: 204 });
    const fetch = context.mock.method(globalThis, "fetch", () =>
        Promise.resolve(response),
    );
    assert.equal(
        await apiRequest(new Request("https://caseward.test"), "/api/session"),
        response,
    );
    const call = fetch.mock.calls[0];
    assert.ok(call);
    const init = call.arguments[1];
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(init.headers, { Accept: "application/json" });
    assert.ok(init.signal instanceof AbortSignal);
});

await test("network failures remain recoverable while caller cancellation propagates", async (context) => {
    context.mock.method(globalThis, "fetch", () =>
        Promise.reject(new TypeError("Private diagnostic")),
    );
    assert.deepEqual(
        await apiRequest(new Request("https://caseward.test"), "/api/session"),
        { status: "error", reason: "network" },
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        apiRequest(
            new Request("https://caseward.test", { signal: controller.signal }),
            "/api/session",
        ),
        { name: "AbortError" },
    );
});
