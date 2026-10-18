import assert from "node:assert/strict";
import { test } from "node:test";
import { resetLink } from "../../app/features/password-recovery/reset-link.ts";

const token = "a".repeat(64);
const path = `/reset-password/${token}`;
await test("reset links preserve plus-addresses and Unicode without normalizing signed credentials", () => {
    for (const email of ["alex+recovery@example.com", "équipe@example.com"]) {
        assert.deepEqual(
            resetLink(
                new URL(
                    `${path}?${new URLSearchParams({ email })}`,
                    "https://caseward.test",
                ),
            ),
            { token, email },
        );
    }
});
for (const invalid of [
    "/reset-password",
    path,
    `${path}?email=`,
    "/reset-password/not-a-token?email=alex@example.com",
    `${path}?email=alex@example.com&email=other@example.com`,
    `${path}?email=%00`,
    `${path}?email=%20%20`,
    `${path}?email=${"x".repeat(255)}`,
]) {
    await test(`rejects malformed reset credentials: ${invalid.slice(0, 120)}`, () => {
        assert.equal(
            resetLink(new URL(invalid, "https://caseward.test")),
            undefined,
        );
    });
}
