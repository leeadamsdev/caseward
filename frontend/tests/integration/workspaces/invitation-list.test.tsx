import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub, useLoaderData } from "react-router";
import { expect, test, vi } from "vitest";
import { InvitationList } from "~/features/workspaces/invitation-list";
import { invitationAction } from "~/features/workspaces/invitations";
import { invitation, memberPage } from "../../fixtures/members";
import { workspace } from "../../fixtures/workspaces";
import { user as account } from "../../fixtures/account";
import { server } from "../../support/http";

const endpoint = `http://localhost/api/workspaces/${workspace.id}/invitations/${invitation.id}`;

function openList(load: () => (typeof invitation)[]) {
    const loader = () => load();
    const Routes = createRoutesStub([
        {
            path: "/w/:workspaceId/members",
            HydrateFallback: () => null,
            loader,
            action: invitationAction,
            Component: () => {
                const invitations = useLoaderData<typeof loader>();
                return (
                    <InvitationList
                        accountId={account.id}
                        result={{
                            status: "loaded",
                            page: memberPage(invitations),
                        }}
                    />
                );
            },
        },
    ]);
    render(<Routes initialEntries={[`/w/${workspace.id}/members`]} />);
    return userEvent.setup();
}

test("resends once, renews the row, counts down and restores the action without replay", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    let current = invitation;
    const resend = vi.fn(() => {
        current = { ...invitation, last_queued_at: new Date().toISOString() };
        return HttpResponse.json(
            { data: current },
            { headers: { "Retry-After": "60" } },
        );
    });
    server.use(http.post(`${endpoint}/resend`, resend));
    const user = openList(() => [current]);
    const button = await screen.findByRole("button", {
        name: `Resend invitation to ${invitation.email}`,
    });
    await user.click(button);
    expect(await screen.findByText("Invitation queued")).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Resend in 60s");
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Resend");
    expect(resend).toHaveBeenCalledTimes(1);
});

test("requires confirmation, deletes with CSRF, and removes the row on revalidation", async () => {
    let items = [invitation];
    const revoke = vi.fn(({ request }: { request: Request }) => {
        expect(request.headers.get("X-XSRF-TOKEN")).toBe("test=token");
        items = [];
        return new HttpResponse(null, { status: 204 });
    });
    server.use(http.delete(endpoint, revoke));
    const user = openList(() => items);
    await user.click(
        await screen.findByRole("button", {
            name: `Revoke invitation for ${invitation.email}`,
        }),
    );
    await user.click(screen.getByRole("button", { name: "Keep invitation" }));
    await waitFor(() =>
        expect(
            screen.getByRole("button", {
                name: `Revoke invitation for ${invitation.email}`,
            }),
        ).toHaveFocus(),
    );
    expect(revoke).not.toHaveBeenCalled();
    await user.click(
        screen.getByRole("button", {
            name: `Revoke invitation for ${invitation.email}`,
        }),
    );
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect(
        await screen.findByText(/No outstanding invitations/),
    ).toBeInTheDocument();
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
        expect(
            screen.getByRole("heading", {
                name: "Invitations",
            }),
        ).toHaveFocus(),
    );
    expect(revoke).toHaveBeenCalledTimes(1);
});
