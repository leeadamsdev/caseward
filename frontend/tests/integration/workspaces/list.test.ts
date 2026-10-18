import { http, HttpResponse } from "msw";
import { beforeEach, expect, test } from "vitest";
import {
    createWorkspaceLoader,
    workspacesLoader,
} from "~/features/workspaces/workspaces";
import { user } from "../../fixtures/account";
import {
    workspace,
    workspaceId,
    workspacePage,
} from "../../fixtures/workspaces";
import { server } from "../../support/http";

const endpoint = "http://localhost/api/workspaces";
const request = (path = "/workspaces") =>
    new Request(`http://localhost${path}`);

beforeEach(() => {
    server.use(
        http.get("http://localhost/api/session", () =>
            HttpResponse.json({ data: user }),
        ),
    );
});

test("loads a bounded requested page and ignores server-supplied navigation URLs", async () => {
    const items = Array.from({ length: 26 }, (_, index) => ({
        ...workspace,
        id: workspaceId(index + 1),
    }));
    const pages: string[] = [];
    server.use(
        http.get(endpoint, ({ request }) => {
            const page = new URL(request.url).searchParams.get("page");
            pages.push(page ?? "missing");
            return HttpResponse.json({
                ...workspacePage(items, Number(page)),
                links: { next: "https://attacker.example" },
            });
        }),
    );
    expect(
        await workspacesLoader({ request: request("/workspaces?page=2") }),
    ).toEqual({
        status: "authenticated",
        user,
        workspaces: {
            status: "loaded",
            page: { items: [items[25]], page: 2, lastPage: 2, total: 26 },
        },
    });
    expect(pages).toEqual(["2"]);
    const result = await workspacesLoader({
        request: request("/workspaces?page=999"),
    });
    if (!(result instanceof Response))
        throw new Error("Expected last-page redirect");
    expect(result.headers.get("Location")).toBe("/workspaces?page=2");
    expect(pages).toEqual(["2", "999"]);
});

test.each(["0", "-1", "1.5", "01", "9007199254740992"])(
    "rejects page %s before making any HTTP requests",
    async (page) => {
        server.resetHandlers();
        const result = await workspacesLoader({
            request: request(`/workspaces?page=${page}`),
        });
        if (!(result instanceof Response))
            throw new Error("Expected canonical-page redirect");
        expect(result.headers.get("Location")).toBe("/workspaces");
    },
);

test("redirects a genuinely empty list to creation but permits creating another workspace", async () => {
    server.use(http.get(endpoint, () => HttpResponse.json(workspacePage([]))));
    const empty = await workspacesLoader({ request: request() });
    if (!(empty instanceof Response))
        throw new Error("Expected creation redirect");
    expect(empty.headers.get("Location")).toBe("/workspaces/new");
    server.use(
        http.get(endpoint, () => HttpResponse.json(workspacePage([workspace]))),
    );
    const result = await createWorkspaceLoader({
        request: request("/workspaces/new?page=999"),
    });
    expect(result).toMatchObject({
        status: "authenticated",
        workspaces: { status: "loaded", page: { items: [workspace], page: 1 } },
    });
});

const valid = workspacePage([workspace]);
test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        reason: "network",
    },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 503 },
            ),
        reason: "server",
    },
    {
        name: "missing envelope",
        response: () => HttpResponse.json({}),
        reason: "server",
    },
    {
        name: "unsafe workspace ID",
        response: () =>
            HttpResponse.json({
                ...valid,
                data: [{ ...workspace, id: "https://attacker.example" }],
            }),
        reason: "server",
    },
    {
        name: "invalid role",
        response: () =>
            HttpResponse.json({
                ...valid,
                data: [{ ...workspace, role: "admin" }],
            }),
        reason: "server",
    },
    {
        name: "duplicate workspace",
        response: () =>
            HttpResponse.json({
                data: [workspace, workspace],
                meta: { ...valid.meta, total: 2 },
            }),
        reason: "server",
    },
    {
        name: "wrong page",
        response: () =>
            HttpResponse.json({
                ...valid,
                meta: { ...valid.meta, current_page: 2 },
            }),
        reason: "server",
    },
    {
        name: "inconsistent total",
        response: () =>
            HttpResponse.json({ ...valid, meta: { ...valid.meta, total: 0 } }),
        reason: "server",
    },
    {
        name: "inconsistent last page",
        response: () =>
            HttpResponse.json({
                ...valid,
                meta: { ...valid.meta, last_page: 2 },
            }),
        reason: "server",
    },
    {
        name: "empty nonempty account",
        response: () => HttpResponse.json({ ...valid, data: [] }),
        reason: "server",
    },
    {
        name: "oversized page",
        response: () =>
            HttpResponse.json({
                data: Array.from({ length: 26 }, (_, index) => ({
                    ...workspace,
                    id: workspaceId(index + 1),
                })),
                meta: { current_page: 1, last_page: 2, total: 26 },
            }),
        reason: "server",
    },
])(
    "never treats a $name list response as an empty account",
    async ({ response, reason }) => {
        server.use(http.get(endpoint, response));
        expect(await workspacesLoader({ request: request() })).toEqual({
            status: "authenticated",
            user,
            workspaces: { status: "error", reason },
        });
    },
);

test.each([
    { status: 401, destination: "/login?reason=session", body: {} },
    {
        status: 403,
        destination: "/verify-email",
        body: { code: "email_unverified" },
    },
])(
    "honours lost access at the workspace API ($status), even after a verified session response",
    async ({ status, destination, body }) => {
        server.use(
            http.get(endpoint, () => HttpResponse.json(body, { status })),
        );
        const result = await workspacesLoader({ request: request() });
        if (!(result instanceof Response))
            throw new Error("Expected access redirect");
        expect(result.headers.get("Location")).toBe(destination);
    },
);
