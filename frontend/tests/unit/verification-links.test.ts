import assert from "node:assert/strict";
import { test } from "node:test";
import {
    verificationPath,
    verificationSignIn,
} from "../../app/features/email-verification/links.ts";

const path = `/email/verify/7/${"a".repeat(40)}?expires=123&signature=abc`;
await test("verification sign-in preserves only the expected local verification destination", () => {
    assert.equal(verificationPath(path), path);
    assert.equal(
        new URL(
            verificationSignIn(path),
            "https://caseward.test",
        ).searchParams.get("returnTo"),
        path,
    );
    assert.equal(verificationSignIn(undefined), "/login");
});
for (const value of [
    null,
    "",
    "https://external.test",
    `//external.test${path}`,
    `/\\external.test${path}`,
    path + "#fragment",
    path.replace("/7/", "/0/"),
    path.replace("/7/", "/../"),
    path.replace("a".repeat(40), "b".repeat(39)),
    "/workspaces",
]) {
    await test(`rejects an unsafe verification destination: ${String(value)}`, () => {
        assert.equal(verificationPath(value), undefined);
    });
}
