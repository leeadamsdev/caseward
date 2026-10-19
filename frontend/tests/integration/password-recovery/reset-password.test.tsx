import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { resetLink } from "~/features/password-recovery/reset-link";
import { resetPassword } from "~/features/password-recovery/reset-password";
import { ResetPasswordForm } from "~/features/password-recovery/reset-password-form";
import {
    newPassword,
    resetCredentials,
    resetPath,
} from "../../fixtures/password-reset";
import { csrfCookie, server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/reset-password";

function openForm(entry = resetPath) {
    const link = resetLink(new URL(entry, "http://localhost"));
    const Routes = createRoutesStub([
        {
            path: "/reset-password/:token?",
            Component: () => <ResetPasswordForm link={link} />,
            action: ({ request }) => resetPassword(request),
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={[entry]} />);
    return userEvent.setup();
}

async function fillPasswords(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
        screen.getByLabelText("New password", { exact: true }),
        newPassword,
    );
    await user.type(
        screen.getByLabelText("Confirm new password", { exact: true }),
        newPassword,
    );
}

test("requires both passwords and rejects mismatched confirmation locally before presenting server password rules", async () => {
    const request = vi.fn(() =>
        HttpResponse.json(
            {
                errors: {
                    password: ["The password must be at least 15 characters."],
                },
            },
            { status: 422 },
        ),
    );
    server.use(http.post(endpoint, request));
    const user = openForm();
    const password = screen.getByLabelText("New password", { exact: true });
    const confirmation = screen.getByLabelText("Confirm new password", {
        exact: true,
    });
    const submit = screen.getByRole("button", { name: "Reset password" });
    await user.click(submit);
    await waitFor(() =>
        expect(password).toHaveAccessibleDescription(
            "New password is required.",
        ),
    );
    expect(confirmation).toHaveAccessibleDescription(
        "Confirm new password is required.",
    );
    expect(password).toHaveFocus();

    await user.type(password, newPassword);
    await user.type(confirmation, "a different passphrase");
    await user.click(submit);
    await waitFor(() =>
        expect(confirmation).toHaveAccessibleDescription(
            "Passwords do not match.",
        ),
    );
    expect(confirmation).toHaveFocus();
    expect(request).not.toHaveBeenCalled();

    await user.clear(password);
    await user.type(password, "short");
    await user.clear(confirmation);
    await user.type(confirmation, "short");
    await user.click(submit);
    await waitFor(() =>
        expect(password).toHaveAccessibleDescription(
            "The password must be at least 15 characters.",
        ),
    );
    expect(password).toHaveFocus();
    expect(password).toHaveValue("short");
    expect(confirmation).toHaveValue("short");
    expect(request).toHaveBeenCalledTimes(1);
});

test("sends credentials from the link with CSRF protection, preserving password spaces and requiring sign-in after success", async () => {
    const requests: { body: unknown; csrf: string | null }[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push({
                body: await request.json(),
                csrf: request.headers.get("X-XSRF-TOKEN"),
            });
            return new HttpResponse(null, { status: 204 });
        }),
    );
    const user = openForm();
    await fillPasswords(user);
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(
        await screen.findByRole("heading", { name: "Password reset" }),
    ).toHaveFocus();
    expect(
        screen.queryByLabelText("New password", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByLabelText("Confirm new password", { exact: true }),
    ).not.toBeInTheDocument();
    expect(requests).toEqual([
        {
            body: {
                ...resetCredentials,
                password: newPassword,
                password_confirmation: newPassword,
            },
            csrf: "test=token",
        },
    ]);
    await user.click(screen.getByRole("link", { name: "Back to sign in" }));
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        /^\/login$/,
    );
    expect(requests).toHaveLength(1);
});

test("shows recovery for a malformed link without rendering editable credentials or sending a reset", async () => {
    const user = openForm("/reset-password");
    expect(
        screen.getByRole("heading", { name: "This link is no longer valid" }),
    ).toHaveFocus();
    expect(
        screen.queryByLabelText("New password", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "Reset password" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Request a new link" }));
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        /^\/forgot-password$/,
    );
});

test.each([
    {
        name: "invalid reset link",
        body: {
            message: "This password reset link is invalid or has expired.",
            code: "invalid_password_reset_link",
        },
    },
    {
        name: "invalid email",
        body: { errors: { email: ["Internal diagnostic"] } },
    },
    {
        name: "invalid token",
        body: { errors: { token: ["Internal diagnostic"] } },
    },
])(
    "handles $name as an unusable link without exposing credential fields or server diagnostics",
    async ({ body }) => {
        const request = vi.fn(() => HttpResponse.json(body, { status: 422 }));
        server.use(http.post(endpoint, request));
        const user = openForm();
        await fillPasswords(user);
        await user.click(
            screen.getByRole("button", { name: "Reset password" }),
        );
        expect(
            await screen.findByRole("heading", {
                name: "This link is no longer valid",
            }),
        ).toHaveFocus();
        expect(screen.queryByRole("form")).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText("New password", { exact: true }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Internal diagnostic"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Request a new link" }),
        ).toHaveAttribute("href", "/forgot-password");
        expect(request).toHaveBeenCalledTimes(1);
    },
);

test("removes the expired cooldown and keeps both passwords until the user explicitly retries", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const request = vi
        .fn<() => Response>()
        .mockImplementationOnce(() =>
            HttpResponse.json(
                {},
                { status: 429, headers: { "Retry-After": "3" } },
            ),
        )
        .mockImplementation(() => new HttpResponse(null, { status: 204 }));
    server.use(http.post(endpoint, request));
    const user = openForm();
    await fillPasswords(user);
    const password = screen.getByLabelText("New password", { exact: true });
    const confirmation = screen.getByLabelText("Confirm new password", {
        exact: true,
    });
    const submit = screen.getByRole("button", { name: "Reset password" });
    await user.click(submit);
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(password).toBeDisabled();
    expect(confirmation).toBeDisabled();
    expect(submit).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(password).toHaveValue(newPassword);
    expect(confirmation).toHaveValue(newPassword);
    expect(password).toBeEnabled();
    expect(confirmation).toBeEnabled();
    expect(submit).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(submit);
    expect(
        await screen.findByRole("heading", { name: "Password reset" }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
});

test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        message: /Your request may have reached us/,
    },
    {
        name: "server",
        response: () => HttpResponse.json({}, { status: 503 }),
        message: /Your request may have reached us/,
    },
    {
        name: "expired CSRF",
        response: () => HttpResponse.json({}, { status: 419 }),
        message: /Your security token expired/,
    },
    {
        name: "malformed validation",
        response: () => HttpResponse.json({}, { status: 422 }),
        message: /Your request may have reached us/,
    },
    {
        name: "unexpected success",
        response: () => HttpResponse.json({}),
        message: /Your request may have reached us/,
    },
])(
    "recovers from $name without claiming success or automatically replaying the reset",
    async ({ response, message }) => {
        const request = vi.fn(response);
        server.use(http.post(endpoint, request));
        const user = openForm();
        await fillPasswords(user);
        await user.click(
            screen.getByRole("button", { name: "Reset password" }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn’t confirm the reset",
        );
        expect(screen.getByRole("alert")).toHaveTextContent(message);
        expect(screen.getByRole("alert")).toHaveFocus();
        expect(
            screen.getByLabelText("New password", { exact: true }),
        ).toHaveValue(newPassword);
        expect(
            screen.getByLabelText("Confirm new password", { exact: true }),
        ).toHaveValue(newPassword);
        expect(
            screen.queryByRole("heading", { name: "Password reset" }),
        ).not.toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);

        let csrf: string | null = null;
        const retry = vi.fn(({ request }: { request: Request }) => {
            csrf = request.headers.get("X-XSRF-TOKEN");
            return new HttpResponse(null, { status: 204 });
        });
        server.use(csrfCookie("fresh-token"), http.post(endpoint, retry));
        await user.click(
            screen.getByRole("button", { name: "Reset password" }),
        );
        expect(
            await screen.findByRole("heading", { name: "Password reset" }),
        ).toBeInTheDocument();
        expect(csrf).toBe("fresh-token");
        expect(request).toHaveBeenCalledTimes(1);
        expect(retry).toHaveBeenCalledTimes(1);
    },
);
