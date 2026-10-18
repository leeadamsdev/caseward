import { expect, test } from "vitest";
import {
    verificationPath,
    verificationSignIn,
} from "~/features/email-verification/links";

const path = `/email/verify/7/${"a".repeat(40)}?expires=123&signature=abc`;

test("verification sign-in preserves only the expected local verification destination", () => {
    expect(verificationPath(path)).toBe(path);
    expect(
        new URL(
            verificationSignIn(path),
            "https://caseward.test",
        ).searchParams.get("returnTo"),
    ).toBe(path);
    expect(verificationSignIn(undefined)).toBe("/login");
});

test.each([
    { name: "missing", value: null },
    { name: "empty", value: "" },
    { name: "external URL", value: "https://external.test" },
    { name: "protocol-relative URL", value: `//external.test${path}` },
    { name: "backslash URL", value: `/\\external.test${path}` },
    { name: "fragment", value: `${path}#fragment` },
    { name: "zero ID", value: path.replace("/7/", "/0/") },
    { name: "traversal", value: path.replace("/7/", "/../") },
    {
        name: "invalid hash",
        value: path.replace("a".repeat(40), "b".repeat(39)),
    },
    { name: "unrelated route", value: "/workspaces" },
])("rejects an unsafe verification destination: $name", ({ value }) => {
    expect(verificationPath(value)).toBeUndefined();
});
