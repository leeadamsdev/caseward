import { http, HttpResponse } from "msw";
import { beforeEach, expect, test } from "vitest";
import { workspaceLoader } from "~/features/workspaces/workspaces";
import { user } from "../../fixtures/account";
import { workspace, workspaceId } from "../../fixtures/workspaces";
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

test("loads the requested workspace and its membership role", async () => {
    const member = { ...workspace, role: "member" };
    server.use(
        http.get(`${endpoint}/${workspace.id}`, () =>
            HttpResponse.json({ data: member }),
        ),
    );
    expect(
        await workspaceLoader({
            request: request(`/w/${workspace.id}`),
            params: { workspaceId: workspace.id },
        }),
    ).toEqual({
        status: "authenticated",
        user,
        result: { status: "loaded", workspace: member },
    });
});

test.each([undefined, "not-an-id", "https://attacker.example"])(
    "does not fetch an invalid workspace identifier %j",
    async (id) => {
        expect(
            await workspaceLoader({
                request: request(),
                params: id === undefined ? {} : { workspaceId: id },
            }),
        ).toEqual({
            status: "authenticated",
            user,
            result: { status: "missing" },
        });
    },
);

test.each([
    {
        name: "revoked access",
        response: () => HttpResponse.json({ data: workspace }, { status: 404 }),
        result: { status: "missing" },
    },
    {
        name: "wrong workspace",
        response: () =>
            HttpResponse.json({ data: { ...workspace, id: workspaceId(2) } }),
        result: { status: "error", reason: "server" },
    },
    {
        name: "malformed membership",
        response: () =>
            HttpResponse.json({ data: { ...workspace, role: "admin" } }),
        result: { status: "error", reason: "server" },
    },
    {
        name: "server failure",
        response: () => HttpResponse.json({ data: workspace }, { status: 503 }),
        result: { status: "error", reason: "server" },
    },
    {
        name: "network failure",
        response: () => HttpResponse.error(),
        result: { status: "error", reason: "network" },
    },
])(
    "does not expose workspace data after $name",
    async ({ response, result }) => {
        server.use(http.get(`${endpoint}/${workspace.id}`, response));
        expect(
            await workspaceLoader({
                request: request(),
                params: { workspaceId: workspace.id },
            }),
        ).toEqual({ status: "authenticated", user, result });
    },
);
