import { z } from "zod";
import { invitationPath } from "./links";

const key = "caseward.pending-invitation";
const lifetime = 60 * 60 * 1000;
const schema = z.object({
    path: z.string().refine((value) => Boolean(invitationPath(value))),
    accountId: z.int().positive(),
    expiresAt: z.int().positive(),
});

// Verification links are signed and may open in another tab. This navigation hint
// grants no access and expires after one hour; the server still checks the recipient.
export function pendingInvitation(accountId: number): string | undefined {
    if (typeof window === "undefined") return;
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        const parsed = schema.safeParse(raw);
        if (
            !parsed.success ||
            parsed.data.expiresAt <= Date.now() ||
            parsed.data.expiresAt > Date.now() + lifetime
        ) {
            localStorage.removeItem(key);
            return;
        }
        if (parsed.data.accountId === accountId) return parsed.data.path;
    } catch {
        /* Navigation still works through the original tab's returnTo URL. */
    }
}

export function rememberInvitation(path: string, accountId: number) {
    if (!invitationPath(path) || typeof window === "undefined") return;
    try {
        if (pendingInvitation(accountId) !== path)
            localStorage.setItem(
                key,
                JSON.stringify({
                    path,
                    accountId,
                    expiresAt: Date.now() + lifetime,
                }),
            );
    } catch {
        /* Storage can be unavailable in privacy modes. */
    }
}

export function forgetInvitation(path?: string) {
    if (typeof window === "undefined") return;
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        const parsed = schema.safeParse(raw);
        if (!path || !parsed.success || parsed.data.path === path)
            localStorage.removeItem(key);
    } catch {
        /* A blocked storage area must not interrupt account actions. */
    }
}
