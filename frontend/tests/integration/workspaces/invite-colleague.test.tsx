import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { InviteColleague } from "~/features/workspaces/invite-colleague";
import { invitationAction } from "~/features/workspaces/invitations";
import { user as account } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";
import { invitation } from "../../fixtures/members";
import { server } from "../../support/http";

const endpoint = `http://localhost/api/workspaces/${workspace.id}/invitations`;
function openPage() {
    const Routes = createRoutesStub([
        {
            path: "/w/:workspaceId/members",
            action: invitationAction,
            Component: () => (
                <InviteColleague workspace={workspace} user={account} />
            ),
        },
    ]);
    render(<Routes initialEntries={[`/w/${workspace.id}/members`]} />);
    return userEvent.setup();
}
async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Invite colleague" }));
    return screen.findByRole("textbox", { name: "Email address" });
}

test("opens an accessible dialog, preserves server-invalid input and focuses the field", async () => {
    server.use(
        http.post(endpoint, () =>
            HttpResponse.json(
                {
                    errors: {
                        email: ["This email address is already invited."],
                    },
                },
                { status: 422 },
            ),
        ),
    );
    const user = openPage();
    const input = await openForm(user);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
        "Invite a colleague",
    );
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription("Email address is required.");
    await user.type(input, invitation.email);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription(
            "This email address is already invited.",
        ),
    );
    expect(input).toHaveFocus();
    expect(input).toHaveValue(invitation.email);
});

test("reports queuing accurately and reopens a fresh form", async () => {
    server.use(
        http.post(endpoint, () =>
            HttpResponse.json(
                { data: invitation },
                { status: 201, headers: { "Retry-After": "60" } },
            ),
        ),
    );
    const user = openPage();
    const input = await openForm(user);
    await user.type(input, invitation.email);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation queued")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
        `We’ll email ${invitation.email}`,
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await openForm(user)).toHaveValue("");
    expect(screen.queryByText("Invitation queued")).not.toBeInTheDocument();
});

test("preserves saved invitations on queue failure and does not replay creation", async () => {
    const create = vi.fn(() =>
        HttpResponse.json(
            { message: "Unavailable", code: "invitation_queue_unavailable" },
            { status: 503 },
        ),
    );
    server.use(http.post(endpoint, create));
    const user = openPage();
    await user.type(await openForm(user), invitation.email);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "The invitation is saved.",
    );
    expect(
        screen.queryByRole("button", { name: "Send invitation" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View invitations" }));
    expect(create).toHaveBeenCalledTimes(1);
});

test("removes rate-limit feedback at expiry without losing input or retrying automatically", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const create = vi.fn(() =>
        HttpResponse.json({}, { status: 429, headers: { "Retry-After": "2" } }),
    );
    server.use(http.post(endpoint, create));
    const user = openPage();
    const input = await openForm(user);
    await user.type(input, invitation.email);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(input).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(input).toHaveValue(invitation.email);
    expect(input).toBeEnabled();
    expect(create).toHaveBeenCalledTimes(1);
});

test("preserves input after a network failure and offers a deliberate retry", async () => {
    server.use(http.post(endpoint, () => HttpResponse.error()));
    const user = openPage();
    const input = await openForm(user);
    await user.type(input, invitation.email);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "We couldn’t confirm the change",
    );
    expect(input).toHaveValue(invitation.email);
    expect(
        screen.getByRole("button", { name: "Send invitation" }),
    ).toBeEnabled();
});
