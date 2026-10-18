import { expect, test } from "vitest";
import { parseUser } from "~/features/authentication/session";
import { user } from "../../fixtures/account";

test("parses verified and unverified accounts without retaining extra response fields", () => {
    for (const email_verified of [true, false]) {
        const account = { ...user, email_verified };
        expect(
            parseUser({ data: { ...account, private: "Diagnostic" } }),
        ).toEqual(account);
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
])("rejects $name instead of trusting its TypeScript shape", ({ body }) => {
    expect(parseUser(body)).toBeUndefined();
});
