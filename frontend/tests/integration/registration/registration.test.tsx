import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { registerAccount } from "~/features/registration/registration";
import { RegistrationForm } from "~/features/registration/registration-form";
import { account, user as registered } from "../../fixtures/account";
import { server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/register";
const created = {
    data: { ...registered, email_verified: false },
    meta: { verification_email_queued: true },
};

function openForm() {
    const Routes = createRoutesStub([
        {
            path: "/register",
            Component: RegistrationForm,
            action: ({ request }) => registerAccount(request),
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={["/register"]} />);
    return userEvent.setup();
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
        screen.getByRole("textbox", { name: "Full name" }),
        account.name,
    );
    await user.type(
        screen.getByRole("textbox", { name: "Email address" }),
        account.email,
    );
    await user.type(
        screen.getByLabelText("Password", { exact: true }),
        account.password,
    );
    await user.type(
        screen.getByLabelText("Confirm password", { exact: true }),
        account.password_confirmation,
    );
}

test("rejects empty fields and mismatched confirmation locally without sending an account request", async () => {
    const user = openForm();
    const submit = screen.getByRole("button", {
        name: "Create account",
    });
    await user.click(submit);
    await waitFor(() =>
        expect(
            screen.getByRole("textbox", { name: "Full name" }),
        ).toHaveAccessibleDescription("Full name is required."),
    );
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveFocus();
    await fillRegistration(user);
    const confirmation = screen.getByLabelText("Confirm password", {
        exact: true,
    });
    await user.clear(confirmation);
    await user.type(confirmation, "a different long passphrase");
    await user.click(submit);
    await waitFor(() =>
        expect(confirmation).toHaveAccessibleDescription(
            "Passwords do not match.",
        ),
    );
    expect(confirmation).toHaveFocus();
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "false",
    );
});

test("keeps server validation associated with its fields and preserves credentials until corrected", async () => {
    server.use(
        http.post(endpoint, () =>
            HttpResponse.json(
                {
                    errors: {
                        email: ["An account with this email already exists."],
                        password: [
                            "Password must be at least 15 characters long.",
                        ],
                    },
                },
                { status: 422 },
            ),
        ),
    );
    const user = openForm();
    await fillRegistration(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    const email = screen.getByRole("textbox", { name: "Email address" });
    await waitFor(() =>
        expect(email).toHaveAccessibleDescription(
            "An account with this email already exists.",
        ),
    );
    expect(email).toHaveFocus();
    expect(
        screen.getByLabelText("Password", { exact: true }),
    ).toHaveAccessibleDescription(
        "Password must be at least 15 characters long.",
    );
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
        account.name,
    );
    expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
        account.password,
    );

    let payload: unknown;
    let csrf: string | null = null;
    server.use(
        http.post(endpoint, async ({ request }) => {
            payload = await request.json();
            csrf = request.headers.get("X-XSRF-TOKEN");
            return HttpResponse.json(created, { status: 201 });
        }),
    );
    await user.clear(email);
    await user.type(email, "another@example.com");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        /^\/verify-email$/,
    );
    expect(payload).toEqual({ ...account, email: "another@example.com" });
    expect(csrf).toBe("test=token");
});

test.each([
    { name: "seconds", header: "3", duration: 4_000 },
    { name: "date", header: "Sat, 17 Oct 2026 12:00:03 GMT", duration: 4_000 },
    { name: "missing", header: null, duration: 61_000 },
])(
    "honours Retry-After ($name), preserves input and requires a deliberate retry",
    async ({ header, duration }) => {
        vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
        vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
        const request = vi
            .fn<() => Response>()
            .mockImplementationOnce(() =>
                HttpResponse.json(
                    {},
                    {
                        status: 429,
                        headers:
                            header === null ? {} : { "Retry-After": header },
                    },
                ),
            )
            .mockImplementation(() =>
                HttpResponse.json(created, { status: 201 }),
            );
        server.use(http.post(endpoint, request));
        const user = openForm();
        await fillRegistration(user);
        const submit = screen.getByRole("button", {
            name: "Create account",
        });
        await user.click(submit);
        expect(
            await screen.findByText("Too many attempts"),
        ).toBeInTheDocument();
        expect(submit).toBeDisabled();
        expect(
            screen.getByRole("textbox", { name: "Full name" }),
        ).toBeDisabled();
        await act(() => vi.advanceTimersByTimeAsync(duration));
        expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
        expect(
            screen.queryByText("You can try again", { exact: true }),
        ).not.toBeInTheDocument();
        expect(screen.getByText("You can try again now.")).toHaveAttribute(
            "role",
            "status",
        );
        expect(submit).toBeEnabled();
        expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
            account.password,
        );
        expect(request).toHaveBeenCalledTimes(1);

        await user.click(submit);
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/verify-email$/,
        );
        expect(request).toHaveBeenCalledTimes(2);
    },
);

test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        message: /may still have reached us/,
    },
    {
        name: "server",
        response: () => HttpResponse.json({}, { status: 500 }),
        message: /Please try again in a moment/,
    },
    {
        name: "invalid success",
        response: () =>
            HttpResponse.json({ data: { email: 123 } }, { status: 201 }),
        message: /Please try again in a moment/,
    },
    {
        name: "invalid validation",
        response: () =>
            HttpResponse.json(
                { errors: { email: "Internal diagnostic" } },
                { status: 422 },
            ),
        message: /Please try again in a moment/,
    },
    {
        name: "HTML",
        response: () =>
            new HttpResponse("<h1>Internal diagnostic</h1>", {
                status: 201,
                headers: { "Content-Type": "text/html" },
            }),
        message: /Please try again in a moment/,
    },
    {
        name: "expired CSRF",
        response: () => HttpResponse.json({}, { status: 419 }),
        message: /Your security token expired/,
    },
])(
    "handles $name safely without losing input or inventing success",
    async ({ response, message }) => {
        server.use(http.post(endpoint, response));
        const user = openForm();
        await fillRegistration(user);
        await user.click(
            screen.getByRole("button", { name: "Create account" }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn’t confirm your account was created.",
        );
        expect(screen.getByRole("alert")).toHaveTextContent(message);
        expect(screen.getByRole("alert")).toHaveFocus();
        expect(
            screen.queryByText("Internal diagnostic"),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
            account.name,
        );
        expect(
            screen.getByRole("textbox", { name: "Email address" }),
        ).toHaveValue(account.email);
        expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
            account.password,
        );
        expect(
            screen.getByLabelText("Confirm password", { exact: true }),
        ).toHaveValue(account.password_confirmation);
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();

        server.use(
            http.post(endpoint, () =>
                HttpResponse.json(created, { status: 201 }),
            ),
        );
        await user.click(
            screen.getByRole("button", { name: "Create account" }),
        );
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/verify-email$/,
        );
    },
);
