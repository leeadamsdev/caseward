import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { CreateWorkspaceForm } from "~/features/workspaces/create-workspace-form";
import { createWorkspace } from "~/features/workspaces/workspaces";
import { user as account } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";
import { csrfCookie, server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/workspaces";
const submitLabel = "Create workspace";

function openForm() {
    const Routes = createRoutesStub([
        {
            path: "/workspaces/new",
            Component: () => (
                <CreateWorkspaceForm user={account} hasWorkspaces />
            ),
            action: createWorkspace,
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={["/workspaces/new"]} />);
    return userEvent.setup();
}

test("validates required input locally and preserves Unicode input, hints and server validation", async () => {
    const request = vi.fn(() =>
        HttpResponse.json(
            {
                errors: {
                    name: ["The name may not be greater than 100 characters."],
                },
            },
            { status: 422 },
        ),
    );
    server.use(http.post(endpoint, request));
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await user.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription(/Workspace name is required/);
    expect(request).not.toHaveBeenCalled();
    await user.type(input, "  Équipe 東京  ");
    await user.click(screen.getByRole("button", { name: submitLabel }));
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription(
            /Use your business or team name.*100 characters/,
        ),
    );
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("  Équipe 東京  ");
    expect(request).toHaveBeenCalledTimes(1);
});

test("creates through a protected account-bound request and opens the server workspace", async () => {
    const requests: { body: unknown; csrf: string | null }[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push({
                body: await request.json(),
                csrf: request.headers.get("X-XSRF-TOKEN"),
            });
            return HttpResponse.json({ data: workspace }, { status: 201 });
        }),
    );
    const user = openForm();
    await user.type(
        screen.getByRole("textbox", { name: "Workspace name" }),
        "  Équipe 東京  ",
    );
    await user.click(screen.getByRole("button", { name: submitLabel }));
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        `/w/${workspace.id}`,
    );
    expect(requests).toEqual([
        {
            body: {
                name: "  Équipe 東京  ",
                account_id: account.id,
            },
            csrf: "test=token",
        },
    ]);
});

test("keeps the name through a cooldown, removes its warning and waits for a deliberate retry", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const request = vi
        .fn<() => Response>()
        .mockImplementationOnce(() =>
            HttpResponse.json(
                {},
                { status: 429, headers: { "Retry-After": "2" } },
            ),
        )
        .mockImplementation(() =>
            HttpResponse.json({ data: workspace }, { status: 201 }),
        );
    server.use(http.post(endpoint, request));
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    const submit = screen.getByRole("button", { name: submitLabel });
    await user.type(input, workspace.name);
    await user.click(submit);
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(input).toHaveValue(workspace.name);
    expect(submit).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(submit);
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        `/w/${workspace.id}`,
    );
    expect(request).toHaveBeenCalledTimes(2);
});

test.each([
    { name: "network", response: () => HttpResponse.error(), expired: false },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 503 },
            ),
        expired: false,
    },
    {
        name: "malformed success",
        response: () => HttpResponse.json({}, { status: 201 }),
        expired: false,
    },
    {
        name: "wrong owner role",
        response: () =>
            HttpResponse.json(
                { data: { ...workspace, role: "member" } },
                { status: 201 },
            ),
        expired: false,
    },
    {
        name: "invalid validation",
        response: () =>
            HttpResponse.json(
                { errors: { name: [7] }, message: "Private diagnostic" },
                { status: 422 },
            ),
        expired: false,
    },
    {
        name: "expired CSRF",
        response: () => HttpResponse.json({}, { status: 419 }),
        expired: true,
    },
])(
    "recovers from $name without inventing success, losing input or replaying creation",
    async ({ response, expired }) => {
        const request = vi.fn(response);
        server.use(http.post(endpoint, request));
        const user = openForm();
        const input = screen.getByRole("textbox", { name: "Workspace name" });
        await user.type(input, workspace.name);
        await user.click(screen.getByRole("button", { name: submitLabel }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(input).toHaveValue(workspace.name);
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
        if (expired) {
            expect(screen.getByRole("alert")).toHaveTextContent(
                "Your security token expired.",
            );
            expect(
                screen.queryByRole("link", { name: "Check workspaces" }),
            ).not.toBeInTheDocument();
        } else {
            expect(
                screen.getByRole("link", { name: "Check workspaces" }),
            ).toHaveAttribute("href", "/workspaces");
        }
        server.use(
            csrfCookie("fresh-token"),
            http.post(endpoint, ({ request }) => {
                expect(request.headers.get("X-XSRF-TOKEN")).toBe("fresh-token");
                return HttpResponse.json({ data: workspace }, { status: 201 });
            }),
        );
        await user.click(screen.getByRole("button", { name: submitLabel }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            `/w/${workspace.id}`,
        );
        expect(request).toHaveBeenCalledTimes(1);
    },
);

test.each([204, 503])(
    "does not create when CSRF bootstrap %s leaves no usable cookie",
    async (status) => {
        server.use(
            http.get(
                "http://localhost/sanctum/csrf-cookie",
                () => new HttpResponse(null, { status }),
            ),
        );
        const user = openForm();
        const input = screen.getByRole("textbox", { name: "Workspace name" });
        await user.type(input, workspace.name);
        await user.click(screen.getByRole("button", { name: submitLabel }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(input).toHaveValue(workspace.name);
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
    },
);

test.each(["", "0", "unexpected", "01", "9007199254740992"])(
    "rejects invalid account context %j before creation",
    async (accountId) => {
        const data = new FormData();
        data.set("intent", "create");
        data.set("account_id", accountId);
        data.set("name", workspace.name);
        expect(
            await createWorkspace({
                request: new Request("http://localhost/workspaces/new", {
                    method: "POST",
                    body: data,
                }),
            }),
        ).toEqual({ status: "error", reason: "server" });
    },
);
