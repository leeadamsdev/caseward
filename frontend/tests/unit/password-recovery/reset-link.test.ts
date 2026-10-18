import { expect, test } from "vitest";
import { resetLink } from "~/features/password-recovery/reset-link";

const token = "a".repeat(64);
const path = `/reset-password/${token}`;

test("reset links preserve plus-addresses and Unicode without normalizing signed credentials", () => {
    for (const email of ["alex+recovery@example.com", "équipe@example.com"]) {
        expect(
            resetLink(
                new URL(
                    `${path}?${new URLSearchParams({ email })}`,
                    "https://caseward.test",
                ),
            ),
        ).toEqual({ token, email });
    }
});

test.each([
    { name: "missing credentials", value: "/reset-password" },
    { name: "missing email", value: path },
    { name: "empty email", value: `${path}?email=` },
    {
        name: "invalid token",
        value: "/reset-password/not-a-token?email=alex@example.com",
    },
    {
        name: "duplicate email",
        value: `${path}?email=alex@example.com&email=other@example.com`,
    },
    { name: "null byte", value: `${path}?email=%00` },
    { name: "blank email", value: `${path}?email=%20%20` },
    { name: "oversized email", value: `${path}?email=${"x".repeat(255)}` },
])("rejects malformed reset credentials: $name", ({ value }) => {
    expect(resetLink(new URL(value, "https://caseward.test"))).toBeUndefined();
});
