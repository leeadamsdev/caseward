import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { InvitationScreen } from "~/features/workspace-invitations/invitation-screen";
import {
    acceptInvitation,
    shouldRevalidateInvitation,
    type InvitationData,
} from "~/features/workspace-invitations/invitation";
import { user as account } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";
import {
    invitationPath as path,
    invitationPreview as preview,
} from "../../fixtures/invitations";
import { server } from "../../support/http";
const endpoint = `http://localhost/api${path}/accept`;
function open(
    data: InvitationData = { status: "ready", path, user: account, preview },
) {
    const Routes = createRoutesStub([
        {
            path: "/invitations/:token",
            Component: () => <InvitationScreen data={data} />,
            action: acceptInvitation,
            shouldRevalidate: shouldRevalidateInvitation,
        },
    ]);
    render(<Routes initialEntries={[path]} />);
    return userEvent.setup();
}
test("requires deliberate acceptance and shows the actual granted role", async () => {
    const mutate = vi.fn(() =>
        HttpResponse.json({ data: { ...workspace, role: "member" } }),
    );
    server.use(http.post(endpoint, mutate));
    const user = open();
    expect(mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    const heading = await screen.findByRole("heading", { name: "You’re in!" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
        screen.getByText(`You’ve joined ${workspace.name} as a Member.`),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("link", { name: "Open workspace" }),
    ).toHaveAttribute("href", `/w/${workspace.id}`);
    expect(
        screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
});
test("shows existing acceptance without mutating or inventing a role", () => {
    open({
        status: "ready",
        path,
        user: account,
        preview: { ...preview, accepted: true },
    });
    expect(
        screen.getByRole("heading", { name: "Already joined" }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
});
test("keeps wrong-account details private and offers an account switch", () => {
    open({ status: "mismatch", path, user: account });
    expect(
        screen.getByRole("button", { name: "Switch account" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(workspace.name)).not.toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
});
test("recovers from a network failure with an explicit status check and no automatic replay", async () => {
    const mutate = vi.fn(() => HttpResponse.error());
    server.use(http.post(endpoint, mutate));
    const user = open();
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(
        screen.getByRole("button", { name: "Check invitation" }),
    ).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(
        screen.queryByRole("heading", { name: "You’re in!" }),
    ).not.toBeInTheDocument();
});
test("replaces an expired invitation with recovery instead of keeping acceptance available", async () => {
    server.use(
        http.post(endpoint, () => HttpResponse.json({}, { status: 410 })),
    );
    const user = open();
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(
        await screen.findByRole("heading", { name: "Invitation unavailable" }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
});
test("removes cooldown feedback at expiry and waits for deliberate acceptance", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const mutate = vi.fn(() =>
        HttpResponse.json({}, { status: 429, headers: { "Retry-After": "2" } }),
    );
    server.use(http.post(endpoint, mutate));
    const user = open();
    const submit = screen.getByRole("button", { name: "Accept invitation" });
    await user.click(submit);
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(submit).toBeEnabled();
    expect(mutate).toHaveBeenCalledTimes(1);
});
