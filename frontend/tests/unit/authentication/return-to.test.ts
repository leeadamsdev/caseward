import { expect, test } from "vitest";
import {
    authReturnTo,
    withReturnTo,
} from "~/features/authentication/return-to";
import { invitationPath as path } from "../../fixtures/invitations";

test("preserves the exact allowed invitation across authentication paths and existing query parameters", () => {
    expect(authReturnTo(path)).toBe(path);
    for (const page of [
        "/login",
        "/register",
        "/verify-email",
        "/verify-email?queue=failed",
    ]) {
        const result = new URL(
            withReturnTo(page, path),
            "https://caseward.test",
        );
        expect(result.searchParams.get("returnTo")).toBe(path);
        if (page.includes("queue"))
            expect(result.searchParams.get("queue")).toBe("failed");
    }
});
test.each([
    null,
    "",
    "https://evil.test",
    `//evil.test${path}`,
    `/\\evil.test${path}`,
    `${path}#fragment`,
    `${path}?next=evil`,
    `${path}/..`,
    path.replace("c".repeat(64), "c".repeat(63)),
    path.toUpperCase(),
    "/workspaces",
    "/api/logout",
])("rejects untrusted continuation %s", (value) => {
    expect(authReturnTo(value)).toBeUndefined();
    expect(withReturnTo("/login", value ?? undefined)).toBe("/login");
});
