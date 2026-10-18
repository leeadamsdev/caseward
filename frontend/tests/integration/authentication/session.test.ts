import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import {
    guestLoader,
    loadSession,
    verifiedSessionLoader,
} from "~/features/authentication/session";
import { user } from "../../fixtures/account";
import { verificationLink } from "../../fixtures/email-verification";
import { server } from "../../support/http";

const endpoint = "http://localhost/api/session";
const request = () => new Request("http://localhost/workspaces");

test.each([true, false])(
    "loads an account with verification %s from the session endpoint",
    async (verified) => {
        const account = { ...user, email_verified: verified };
        server.use(
            http.get(endpoint, () => HttpResponse.json({ data: account })),
        );
        expect(await loadSession(request())).toEqual({
            status: verified ? "authenticated" : "unverified",
            user: account,
        });
    },
);

test("treats only an unauthenticated response as a guest", async () => {
    server.use(
        http.get(endpoint, () => HttpResponse.json({}, { status: 401 })),
    );
    expect(await loadSession(request())).toEqual({ status: "guest" });
    const result = await verifiedSessionLoader({ request: request() });
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response))
        throw new Error("Expected sign-in redirect");
    expect(result.headers.get("Location")).toBe("/login?reason=session");
});

test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        reason: "network",
    },
    {
        name: "server",
        response: () => HttpResponse.json({ data: user }, { status: 503 }),
        reason: "server",
    },
    {
        name: "malformed account",
        response: () =>
            HttpResponse.json({
                data: { ...user, id: "7", name: "Private diagnostic" },
            }),
        reason: "server",
    },
    {
        name: "HTML",
        response: () => new HttpResponse("<h1>Private diagnostic</h1>"),
        reason: "server",
    },
])(
    "preserves a $name session failure through both guards instead of signing the user out",
    async ({ response, reason }) => {
        server.use(http.get(endpoint, response));
        const error = { status: "error", reason };
        expect(await loadSession(request())).toEqual(error);
        expect(await guestLoader({ request: request() })).toEqual(error);
        expect(await verifiedSessionLoader({ request: request() })).toEqual(
            error,
        );
    },
);

test("routes an unverified account to verification before granting protected access", async () => {
    server.use(
        http.get(endpoint, () =>
            HttpResponse.json({ data: { ...user, email_verified: false } }),
        ),
    );
    const result = await verifiedSessionLoader({ request: request() });
    if (!(result instanceof Response))
        throw new Error("Expected verification redirect");
    expect(result.headers.get("Location")).toBe("/verify-email");
});

test.each([
    { verified: true, returnTo: null, destination: "/workspaces" },
    { verified: false, returnTo: null, destination: "/verify-email" },
    {
        verified: true,
        returnTo: "https://attacker.example",
        destination: "/workspaces",
    },
    {
        verified: false,
        returnTo: verificationLink,
        destination: verificationLink,
    },
])(
    "routes guest pages safely for verification $verified and return target $returnTo",
    async ({ verified, returnTo, destination }) => {
        server.use(
            http.get(endpoint, () =>
                HttpResponse.json({
                    data: { ...user, email_verified: verified },
                }),
            ),
        );
        const url = new URL("http://localhost/login");
        if (returnTo) url.searchParams.set("returnTo", returnTo);
        const result = await guestLoader({ request: new Request(url) });
        if (!(result instanceof Response))
            throw new Error("Expected signed-in redirect");
        expect(result.headers.get("Location")).toBe(destination);
    },
);
