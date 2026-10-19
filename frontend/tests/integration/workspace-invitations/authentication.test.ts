import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { guestLoader, signOut } from "~/features/authentication/session";
import { signIn } from "~/features/authentication/login";
import { registerAccount } from "~/features/registration/registration";
import {
    waitingLoader,
    waitingAction,
    verificationLoader,
} from "~/features/email-verification/verification";
import { changeEmail } from "~/features/email-verification/change-email";
import {
    pendingInvitation,
    rememberInvitation,
} from "~/features/workspace-invitations/continuation";
import { withReturnTo } from "~/features/authentication/return-to";
import { user, account } from "../../fixtures/account";
import { invitationPath as path } from "../../fixtures/invitations";
import { server } from "../../support/http";

function request(page: string, values?: Record<string, string>) {
    const url = `http://localhost${withReturnTo(page, path)}`;
    if (!values) return new Request(url);
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => {
        data.set(key, value);
    });
    return new Request(url, { method: "POST", body: data });
}
function destination(value: unknown) {
    expect(value).toBeInstanceOf(Response);
    if (!(value instanceof Response)) throw new Error("Expected navigation");
    return value.headers.get("Location");
}
test("returns authenticated guest pages and successful sign-in to the invitation", async () => {
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
        http.post(
            "http://localhost/api/login",
            () => new HttpResponse(null, { status: 204 }),
        ),
    );
    expect(destination(await guestLoader({ request: request("/login") }))).toBe(
        path,
    );
    expect(
        destination(
            await signIn(
                request("/login", {
                    email: account.email,
                    password: account.password,
                }),
            ),
        ),
    ).toBe(path);
});
test.each([true, false])(
    "preserves the invitation through registration with queue success %s",
    async (queued) => {
        server.use(
            http.post("http://localhost/api/register", () =>
                HttpResponse.json(
                    {
                        data: { ...user, email_verified: false },
                        meta: { verification_email_queued: queued },
                    },
                    { status: 201 },
                ),
            ),
        );
        expect(
            destination(await registerAccount(request("/register", account))),
        ).toBe(
            withReturnTo(
                queued ? "/verify-email" : "/verify-email?queue=failed",
                path,
            ),
        );
    },
);
test("keeps an account-bound cross-tab handoff and resumes after checking verified status", async () => {
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: { ...user, email_verified: false } }),
        ),
    );
    expect(
        await waitingLoader({ request: request("/verify-email") }),
    ).toMatchObject({ status: "unverified" });
    expect(pendingInvitation(user.id)).toBe(path);
    const signed = `/email/verify/${String(user.id)}/${"a".repeat(40)}?expires=123&signature=abc`;
    expect(
        await verificationLoader({
            request: new Request(`http://localhost${signed}`),
        }),
    ).toMatchObject({ continuation: path, path: signed });
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
    );
    expect(
        destination(await waitingLoader({ request: request("/verify-email") })),
    ).toBe(path);
});
test("never applies a saved invitation to a different verified account", async () => {
    rememberInvitation(path, user.id + 1);
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
    );
    const result = await verificationLoader({
        request: new Request(
            `http://localhost/email/verify/${String(user.id)}/${"a".repeat(40)}?signature=abc`,
        ),
    });
    expect(result).not.toBeInstanceOf(Response);
    expect(result).not.toHaveProperty("continuation", path);
});
test("preserves invitation intent after email correction and already-verified resends", async () => {
    server.use(
        http.patch("http://localhost/api/email", () =>
            HttpResponse.json({
                data: { ...user, email_verified: false },
                meta: { verification_email_queued: true },
            }),
        ),
        http.post(
            "http://localhost/api/email/verification-notification",
            () => new HttpResponse(null, { status: 204 }),
        ),
    );
    expect(
        destination(
            await changeEmail({
                request: request("/verify-email/change", {
                    email: account.email,
                    account_id: String(user.id),
                }),
            }),
        ),
    ).toBe(withReturnTo("/verify-email?updated=1", path));
    expect(
        destination(
            await waitingAction({
                request: request("/verify-email", {
                    intent: "resend",
                    returnTo: path,
                }),
            }),
        ),
    ).toBe(path);
});
test("retains intent through sign-out and clears the browser continuation", async () => {
    rememberInvitation(path, user.id);
    server.use(
        http.post(
            "http://localhost/api/logout",
            () => new HttpResponse(null, { status: 204 }),
        ),
    );
    expect(
        destination(
            await signOut({
                request: request(path, { intent: "logout", returnTo: path }),
            }),
        ),
    ).toBe(withReturnTo("/login", path));
    expect(pendingInvitation(user.id)).toBeUndefined();
});
