import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { invitationAction } from "~/features/workspaces/invitations";
import { user } from "../../fixtures/account";
import { workspace, workspaceId } from "../../fixtures/workspaces";
import { invitation } from "../../fixtures/members";
import { server } from "../../support/http";

const endpoint = `http://localhost/api/workspaces/${workspace.id}/invitations`;
function submit(intent = "invite", overrides: Record<string, string> = {}) {
    const data = new FormData();
    Object.entries({
        intent,
        account_id: String(user.id),
        email: invitation.email,
        invitation_id: invitation.id,
        ...overrides,
    }).forEach(([key, value]) => {
        data.set(key, value);
    });
    return invitationAction({
        request: new Request(`http://localhost/w/${workspace.id}/members`, {
            method: "POST",
            body: data,
        }),
        params: { workspaceId: workspace.id },
    });
}

test.each(["invite", "resend", "revoke"])(
    "sends account-bound CSRF-protected %s with the expected method",
    async (intent) => {
        const handler = async ({ request }: { request: Request }) => {
            expect(request.headers.get("X-XSRF-TOKEN")).toBe("test=token");
            expect(await request.json()).toEqual(
                intent === "invite"
                    ? { account_id: user.id, email: invitation.email }
                    : { account_id: user.id },
            );
            return intent === "revoke"
                ? new HttpResponse(null, { status: 204 })
                : HttpResponse.json(
                      { data: invitation },
                      {
                          status: intent === "invite" ? 201 : 200,
                          headers: { "Retry-After": "60" },
                      },
                  );
        };
        server.use(
            http.post(endpoint, handler),
            http.post(`${endpoint}/${invitation.id}/resend`, handler),
            http.delete(`${endpoint}/${invitation.id}`, handler),
        );
        const result = await submit(intent);
        expect(result).toMatchObject({
            status: intent === "revoke" ? "revoked" : "queued",
        });
    },
);

test.each([
    { status: 419, body: {}, expected: { status: "error", reason: "expired" } },
    {
        status: 503,
        body: { message: "Unavailable", code: "invitation_queue_unavailable" },
        expected: { status: "queue-failed" },
    },
    {
        status: 503,
        body: { message: "Private diagnostic" },
        expected: { status: "error", reason: "server" },
    },
    { status: 201, body: {}, expected: { status: "error", reason: "server" } },
    {
        status: 201,
        body: { data: { ...invitation, email: "other@caseward.test" } },
        expected: { status: "error", reason: "server" },
    },
    {
        status: 422,
        body: { errors: { email: ["Already invited."] } },
        expected: {
            status: "validation",
            errors: { email: ["Already invited."] },
        },
    },
])(
    "handles invitation response $status without inventing success",
    async ({ status, body, expected }) => {
        server.use(
            http.post(endpoint, () => HttpResponse.json(body, { status })),
        );
        expect(await submit()).toEqual(expected);
    },
);

test.each([
    { status: 401, body: {}, path: "/login?reason=session" },
    { status: 403, body: { code: "email_unverified" }, path: "/verify-email" },
    { status: 403, body: { message: "Forbidden" }, path: `/w/${workspace.id}` },
    { status: 404, body: {}, path: `/w/${workspace.id}` },
    {
        status: 409,
        body: { message: "Changed", code: "account_context_changed" },
        path: `/w/${workspace.id}/members?account=changed`,
    },
])(
    "refreshes session and access after $status",
    async ({ status, body, path }) => {
        server.use(
            http.post(endpoint, () => HttpResponse.json(body, { status })),
        );
        const result = await submit();
        expect(result).toBeInstanceOf(Response);
        if (result instanceof Response)
            expect(result.headers.get("Location")).toBe(path);
    },
);

test("honours server Retry-After without replaying the mutation", async () => {
    server.use(
        http.post(endpoint, () =>
            HttpResponse.json(
                {},
                { status: 429, headers: { "Retry-After": "9" } },
            ),
        ),
    );
    const result = await submit();
    expect(result).toMatchObject({ status: "rate-limited" });
    if (!(result instanceof Response) && result.status === "rate-limited")
        expect(result.retryAt - result.receivedAt).toBe(9000);
});

test("does not accept a resend response for another invitation", async () => {
    server.use(
        http.post(`${endpoint}/${invitation.id}/resend`, () =>
            HttpResponse.json({ data: { ...invitation, id: workspaceId(4) } }),
        ),
    );
    expect(await submit("resend")).toEqual({
        status: "error",
        reason: "server",
    });
});

test.each(["resend", "revoke"])(
    "refreshes unavailable %s invitations",
    async (intent) => {
        const handler = () => HttpResponse.json({}, { status: 410 });
        server.use(
            http.post(`${endpoint}/${invitation.id}/resend`, handler),
            http.delete(`${endpoint}/${invitation.id}`, handler),
        );
        expect(await submit(intent)).toEqual({ status: "unavailable" });
    },
);

test.each([
    { account_id: "0" },
    { account_id: "9007199254740992" },
    { account_id: "01" },
    { intent: "accept" },
])("rejects invalid internal form context %j", async (overrides) => {
    expect(await submit("invite", overrides)).toEqual({
        status: "error",
        reason: "server",
    });
});

test("checks only required input locally", async () => {
    expect(await submit("invite", { email: " " })).toEqual({
        status: "validation",
        errors: { email: ["Email address is required."] },
    });
});
