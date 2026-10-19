import { http, HttpResponse } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { membersLoader, membersPath } from "~/features/workspaces/members";
import { user } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";
import { member, invitation, memberPage } from "../../fixtures/members";
import { server } from "../../support/http";

const endpoint = `http://localhost/api/workspaces/${workspace.id}`;
const load = (query = "") =>
    membersLoader({
        request: new Request(
            `http://localhost${membersPath(workspace.id)}${query}`,
        ),
        params: { workspaceId: workspace.id },
    });

beforeEach(() => {
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
        http.get(endpoint, () => HttpResponse.json({ data: workspace })),
        http.get(`${endpoint}/members`, () =>
            HttpResponse.json(memberPage([member])),
        ),
        http.get(`${endpoint}/invitations`, () =>
            HttpResponse.json(memberPage([invitation])),
        ),
    );
});

test("loads members and outstanding invitations for owners", async () => {
    expect(await load()).toMatchObject({
        members: { status: "loaded", page: { data: [member] } },
        invitations: { status: "loaded", page: { data: [invitation] } },
    });
});

test("does not request private invitation data for members", async () => {
    const invitations = vi.fn(() =>
        HttpResponse.json({ message: "Private" }, { status: 403 }),
    );
    server.use(
        http.get(endpoint, () =>
            HttpResponse.json({ data: { ...workspace, role: "member" } }),
        ),
        http.get(`${endpoint}/invitations`, invitations),
    );
    expect(await load()).toMatchObject({
        invitations: undefined,
        members: { status: "loaded" },
    });
    expect(invitations).not.toHaveBeenCalled();
});

test.each([401, 403, 404])(
    "redirects when access changes during list loading (%s)",
    async (status) => {
        server.use(
            http.get(`${endpoint}/members`, () =>
                HttpResponse.json({ code: "email_unverified" }, { status }),
            ),
        );
        const result = await load();
        expect(result).toBeInstanceOf(Response);
        if (!(result instanceof Response)) throw new Error("Expected redirect");
        expect(result.headers.get("Location")).toBe(
            status === 401
                ? "/login?reason=session"
                : status === 403
                  ? "/verify-email"
                  : `/w/${workspace.id}`,
        );
    },
);

test("does not treat owner permission denial as email verification", async () => {
    server.use(
        http.get(`${endpoint}/invitations`, () =>
            HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
        ),
    );
    const result = await load();
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response)
        expect(result.headers.get("Location")).toBe(`/w/${workspace.id}`);
});

test.each([
    { name: "duplicate identities", body: memberPage([member, member]) },
    { name: "wrong page", body: memberPage([member], 2, 26) },
    { name: "invalid role", body: memberPage([{ ...member, role: "admin" }]) },
    { name: "empty name", body: memberPage([{ ...member, name: " " }]) },
    {
        name: "invalid pagination",
        body: {
            ...memberPage([member]),
            meta: { ...memberPage([member]).meta, per_page: 0 },
        },
    },
])(
    "rejects $name without losing independently loaded invitations",
    async ({ body }) => {
        server.use(
            http.get(`${endpoint}/members`, () => HttpResponse.json(body)),
        );
        expect(await load()).toMatchObject({
            members: { status: "error" },
            invitations: { status: "loaded" },
        });
    },
);

test("keeps members available when invitations fail or have invalid timestamps", async () => {
    server.use(
        http.get(`${endpoint}/invitations`, () =>
            HttpResponse.json(
                memberPage([{ ...invitation, expires_at: "not-a-date" }]),
            ),
        ),
    );
    expect(await load()).toMatchObject({
        members: { status: "loaded" },
        invitations: { status: "error" },
    });
});

test.each([
    "?membersPage=0",
    "?invitationsPage=evil",
    "?membersPage=9007199254740992",
])("normalizes invalid page input %s", async (query) => {
    const result = await load(query);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response)
        expect(result.headers.get("Location")).toBe(membersPath(workspace.id));
});

test("bounds each paginator independently and preserves the other page", async () => {
    server.use(
        http.get(`${endpoint}/members`, ({ request }) => {
            expect(new URL(request.url).searchParams.get("page")).toBe("2");
            return HttpResponse.json(memberPage([member], 2, 26));
        }),
        http.get(`${endpoint}/invitations`, () =>
            HttpResponse.json(memberPage([], 3, 1)),
        ),
    );
    const result = await load("?membersPage=2&invitationsPage=3");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response)
        expect(result.headers.get("Location")).toBe(
            `${membersPath(workspace.id)}?membersPage=2&invitationsPage=1`,
        );
});
