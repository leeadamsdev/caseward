import { expect, test, vi } from "vitest";
import { loadSession } from "~/features/authentication/session";
import { user } from "../../fixtures/account";

test("parses verified and unverified accounts without retaining extra response fields", async () => {
    for (const email_verified of [true, false]) {
        const account = { ...user, email_verified };
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({ data: { ...account, private: "Diagnostic" } }),
        );
        expect(
            await loadSession(new Request("http://localhost/register")),
        ).toEqual({
            status: email_verified ? "authenticated" : "unverified",
            user: account,
        });
    }
});

test.each([
    { name: "missing envelope", body: user },
    { name: "array envelope", body: { data: [user] } },
    { name: "null account", body: { data: null } },
    { name: "string ID", body: { data: { ...user, id: "7" } } },
    { name: "zero ID", body: { data: { ...user, id: 0 } } },
    { name: "fractional ID", body: { data: { ...user, id: 1.5 } } },
    {
        name: "unsafe ID",
        body: { data: { ...user, id: Number.MAX_SAFE_INTEGER + 1 } },
    },
    { name: "blank name", body: { data: { ...user, name: "  " } } },
    { name: "blank email", body: { data: { ...user, email: "  " } } },
    {
        name: "nonboolean verification",
        body: { data: { ...user, email_verified: "true" } },
    },
])(
    "rejects $name instead of trusting its TypeScript shape",
    async ({ body }) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(body),
        );
        expect(
            await loadSession(new Request("http://localhost/register")),
        ).toEqual({ status: "error", reason: "server" });
    },
);
