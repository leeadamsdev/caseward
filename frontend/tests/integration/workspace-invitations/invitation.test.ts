import { http, HttpResponse } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import {
    invitationLoader,
    acceptInvitation,
} from "~/features/workspace-invitations/invitation";
import {
    pendingInvitation,
    rememberInvitation,
} from "~/features/workspace-invitations/continuation";
import { withReturnTo } from "~/features/authentication/return-to";
import { user } from "../../fixtures/account";
import { workspace, workspaceId } from "../../fixtures/workspaces";
import {
    invitationPath as path,
    invitationPreview as preview,
} from "../../fixtures/invitations";
import { server } from "../../support/http";

const endpoint = `http://localhost/api${path}`;
const load = (target = path) =>
    invitationLoader({ request: new Request(`http://localhost${target}`) });
function accept(overrides: Record<string, string> = {}) {
    const data = new FormData();
    Object.entries({
        intent: "accept",
        account_id: String(user.id),
        workspace_id: workspace.id,
        ...overrides,
    }).forEach(([key, value]) => {
        data.set(key, value);
    });
    return acceptInvitation({
        request: new Request(`http://localhost${path}`, {
            method: "POST",
            body: data,
        }),
    });
}
beforeEach(() => {
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
        http.get(endpoint, () => HttpResponse.json({ data: preview })),
    );
});

test.each(["guest", "unverified"])(
    "never requests private preview information for %s users",
    async (status) => {
        const previewRequest = vi.fn(() =>
            HttpResponse.json({ data: preview }),
        );
        server.use(
            http.get("http://localhost/api/session", () =>
                status === "guest"
                    ? HttpResponse.json({}, { status: 401 })
                    : HttpResponse.json({
                          data: { ...user, email_verified: false },
                      }),
            ),
            http.get(endpoint, previewRequest),
        );
        expect(await load()).toMatchObject({ status, path });
        expect(previewRequest).not.toHaveBeenCalled();
        expect(pendingInvitation(user.id)).toBe(
            status === "unverified" ? path : undefined,
        );
    },
);
test("loads a preview without accepting, and recognises an already accepted invitation", async () => {
    const mutate = vi.fn(() => HttpResponse.json({}));
    server.use(http.post(`${endpoint}/accept`, mutate));
    expect(await load()).toMatchObject({ status: "ready", preview });
    expect(mutate).not.toHaveBeenCalled();
    server.use(
        http.get(endpoint, () =>
            HttpResponse.json({ data: { ...preview, accepted: true } }),
        ),
    );
    expect(await load()).toMatchObject({
        status: "ready",
        preview: { accepted: true },
    });
});
test.each(["/invitations", "/invitations/bad", "/invitations/%2Fattacker"])(
    "rejects malformed link %s before making requests",
    async (value) => {
        expect(await load(value)).toEqual({ status: "unavailable" });
    },
);
test.each([
    {
        status: 403,
        body: { code: "invitation_account_mismatch" },
        expected: { status: "mismatch", user, path },
    },
    { status: 410, body: {}, expected: { status: "unavailable" } },
    {
        status: 200,
        body: { data: { ...preview, email: "other@caseward.test" } },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 200,
        body: { data: { ...preview, expires_at: "invalid" } },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 200,
        body: {
            data: {
                ...preview,
                workspace: { ...preview.workspace, id: "bad" },
            },
        },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 503,
        body: { message: "Private diagnostic" },
        expected: { status: "error", reason: "server" },
    },
])(
    "handles preview response $status without leaking private data",
    async ({ status, body, expected }) => {
        server.use(
            http.get(endpoint, () => HttpResponse.json(body, { status })),
        );
        expect(await load()).toEqual(expected);
    },
);
test.each([
    { status: 401, body: {}, target: withReturnTo("/login", path) },
    {
        status: 403,
        body: { code: "email_unverified" },
        target: withReturnTo("/verify-email", path),
    },
])(
    "keeps the invitation through preview access change $status",
    async ({ status, body, target }) => {
        server.use(
            http.get(endpoint, () => HttpResponse.json(body, { status })),
        );
        const result = await load();
        expect(result).toBeInstanceOf(Response);
        if (result instanceof Response)
            expect(result.headers.get("Location")).toBe(target);
    },
);
test("accepts only after a protected account-bound POST, retaining the actual granted role", async () => {
    rememberInvitation(path, user.id);
    server.use(
        http.post(`${endpoint}/accept`, async ({ request }) => {
            expect(request.headers.get("X-XSRF-TOKEN")).toBe("test=token");
            expect(await request.json()).toEqual({ account_id: user.id });
            return HttpResponse.json({ data: workspace });
        }),
    );
    expect(await accept()).toEqual({ status: "accepted", workspace });
    expect(pendingInvitation(user.id)).toBeUndefined();
});
test.each([
    { status: 410, body: {}, expected: { status: "unavailable" } },
    { status: 419, body: {}, expected: { status: "error", reason: "expired" } },
    {
        status: 503,
        body: { message: "Private" },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 200,
        body: { data: { ...workspace, id: workspaceId(2) } },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 200,
        body: { data: { ...workspace, role: "admin" } },
        expected: { status: "error", reason: "server" },
    },
])(
    "handles acceptance response $status without fabricating membership",
    async ({ status, body, expected }) => {
        server.use(
            http.post(`${endpoint}/accept`, () =>
                HttpResponse.json(body, { status }),
            ),
        );
        expect(await accept()).toEqual(expected);
    },
);
test.each([
    { status: 401, body: {}, target: withReturnTo("/login", path) },
    {
        status: 403,
        body: { code: "email_unverified" },
        target: withReturnTo("/verify-email", path),
    },
    {
        status: 403,
        body: { code: "invitation_account_mismatch" },
        target: `${path}?account=changed`,
    },
    {
        status: 409,
        body: { code: "account_context_changed" },
        target: `${path}?account=changed`,
    },
])(
    "requires a fresh review after acceptance access change $status",
    async ({ status, body, target }) => {
        server.use(
            http.post(`${endpoint}/accept`, () =>
                HttpResponse.json(body, { status }),
            ),
        );
        const result = await accept();
        expect(result).toBeInstanceOf(Response);
        if (result instanceof Response)
            expect(result.headers.get("Location")).toBe(target);
    },
);
test.each([
    { account_id: "0" },
    { account_id: "9007199254740992" },
    { workspace_id: "bad" },
    { intent: "join-automatically" },
])("rejects malformed confirmation %j", async (values) => {
    expect(await accept(values)).toEqual({ status: "error", reason: "server" });
});
test("honours rate limits for preview and acceptance", async () => {
    const handler = () =>
        HttpResponse.json(
            {},
            { status: 429, headers: { "Retry-After": "12" } },
        );
    server.use(
        http.get(endpoint, handler),
        http.post(`${endpoint}/accept`, handler),
    );
    for (const result of [await load(), await accept()]) {
        expect(result).toMatchObject({ status: "rate-limited" });
        if (!(result instanceof Response) && result.status === "rate-limited")
            expect(result.retryAt - result.receivedAt).toBe(12_000);
    }
});
