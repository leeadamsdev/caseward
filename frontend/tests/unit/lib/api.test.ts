import { expect, test, vi } from "vitest";
import {
    apiRequest,
    isRecord,
    requiredFields,
    responseBody,
    retryWindow,
    validationErrors,
} from "~/lib/api";

test("only objects are accepted as response records", () => {
    for (const value of [null, undefined, [], "text", 3, true])
        expect(isRecord(value)).toBe(false);
    expect(isRecord({ errors: {} })).toBe(true);
});

test("validation errors accept only nonempty string arrays for known fields", () => {
    const fields = [{ name: "email" }, { name: "password" }] as const;
    expect(
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
    ).toEqual({ email: ["Invalid email"] });
    for (const errors of [
        null,
        [],
        { email: [] },
        { email: [7] },
        { email: ["   "] },
        { email: ["Valid", null] },
    ]) {
        expect(validationErrors({ errors }, fields)).toBeUndefined();
    }
});

test("required fields preserve password spaces and reject blank text and uploaded files", () => {
    const form = new FormData();
    form.set("email", "  ");
    form.set("password", "  ");
    form.set("name", new File(["untrusted"], "name.txt"));
    const result = requiredFields(form, [
        { name: "email", label: "Email", type: "email" },
        { name: "password", label: "Password", type: "password" },
        { name: "name", label: "Name", type: "text" },
    ]);
    expect(result.values).toEqual({ email: "  ", password: "  ", name: "" });
    expect(result.errors).toEqual({
        email: ["Email is required."],
        name: ["Name is required."],
    });
});

test.each([
    { name: "seconds", header: "3601", delay: 3_601_000 },
    { name: "zero", header: "0", delay: 0 },
    {
        name: "future date",
        header: "Sat, 17 Oct 2026 12:01:01 GMT",
        delay: 61_000,
    },
    { name: "past date", header: "Sat, 17 Oct 2026 11:59:59 GMT", delay: 0 },
    { name: "missing", header: null, delay: 60_000 },
    { name: "invalid", header: "invalid", delay: 60_000 },
    { name: "overflow", header: "9".repeat(400), delay: 60_000 },
])(
    "Retry-After: $name produces a bounded retry window",
    ({ header, delay }) => {
        const now = Date.parse("2026-10-17T12:00:00Z");
        vi.spyOn(Date, "now").mockReturnValue(now);
        const headers = header === null ? {} : { "Retry-After": header };
        expect(retryWindow(new Response(null, { headers }))).toEqual({
            receivedAt: now,
            retryAt: now + delay,
        });
    },
);

test("malformed response JSON is rejected without exposing the response", async () => {
    expect(
        await responseBody(new Response("<html>Private diagnostic</html>")),
    ).toBeUndefined();
    expect(await responseBody(Response.json({ data: 1 }))).toEqual({ data: 1 });
});

test("API requests enforce credentials, JSON acceptance and uncached responses", async () => {
    const response = new Response(null, { status: 204 });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    expect(
        await apiRequest(new Request("https://caseward.test"), "/api/session"),
    ).toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call?.[0]).toBe("/api/session");
    const init = call?.[1];
    expect(init).toMatchObject({
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
});

test("network failures remain recoverable while caller cancellation propagates", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new TypeError("Private diagnostic"),
    );
    expect(
        await apiRequest(new Request("https://caseward.test"), "/api/session"),
    ).toEqual({ status: "error", reason: "network" });
    const controller = new AbortController();
    controller.abort();
    await expect(
        apiRequest(
            new Request("https://caseward.test", { signal: controller.signal }),
            "/api/session",
        ),
    ).rejects.toMatchObject({ name: "AbortError" });
});
