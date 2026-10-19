import { expect, test, vi } from "vitest";
import {
    pendingInvitation,
    rememberInvitation,
    forgetInvitation,
} from "~/features/workspace-invitations/continuation";
import { invitationPath as path } from "../../fixtures/invitations";

const key = "caseward.pending-invitation";
test("binds the cross-tab continuation to the account and expires it after one hour", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    rememberInvitation(path, 7);
    expect(pendingInvitation(7)).toBe(path);
    expect(pendingInvitation(8)).toBeUndefined();
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(pendingInvitation(7)).toBeUndefined();
    expect(localStorage.getItem(key)).toBeNull();
});
test.each([
    "invalid JSON",
    JSON.stringify({
        path: "https://evil.test",
        accountId: 7,
        expiresAt: Date.now() + 1000,
    }),
    JSON.stringify({ path, accountId: "7", expiresAt: Date.now() + 1000 }),
    JSON.stringify({ path, accountId: 7, expiresAt: Date.now() + 86_400_000 }),
])("rejects malformed or unbounded browser storage %s", (value) => {
    localStorage.setItem(key, value);
    expect(pendingInvitation(7)).toBeUndefined();
});
test("does not erase another in-flight invitation when an older one completes", () => {
    const other = path.replaceAll("c", "d");
    rememberInvitation(other, 7);
    forgetInvitation(path);
    expect(pendingInvitation(7)).toBe(other);
    forgetInvitation(other);
    expect(pendingInvitation(7)).toBeUndefined();
});
test("rejects foreign paths and permits navigation when storage is blocked", () => {
    rememberInvitation("https://evil.test", 7);
    expect(localStorage.length).toBe(0);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("Blocked");
    });
    expect(() => {
        rememberInvitation(path, 7);
    }).not.toThrow();
    expect(pendingInvitation(7)).toBeUndefined();
    expect(() => {
        forgetInvitation();
    }).not.toThrow();
});
