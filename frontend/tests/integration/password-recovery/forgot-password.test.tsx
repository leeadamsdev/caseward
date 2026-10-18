import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { requestPasswordReset } from "~/features/password-recovery/forgot-password";
import { ForgotPasswordForm } from "~/features/password-recovery/forgot-password-form";
import { server } from "../../support/http";

const endpoint = "http://localhost/api/forgot-password";
const email = "alex+recovery@example.com";
const accepted = {
    message:
        "If an account matches that email address, we will send a password reset link.",
};

function openForm() {
    const Routes = createRoutesStub([
        {
            path: "/forgot-password",
            Component: ForgotPasswordForm,
            action: ({ request }) => requestPasswordReset(request),
        },
    ]);
    render(<Routes initialEntries={["/forgot-password"]} />);
    return userEvent.setup();
}

test("validates required input locally and preserves the address after server validation", async () => {
    const request = vi.fn(() =>
        HttpResponse.json(
            { errors: { email: ["Enter a valid email address."] } },
            { status: 422 },
        ),
    );
    server.use(http.post(endpoint, request));
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Email address" });
    const submit = screen.getByRole("button", { name: "Send reset link" });

    await user.click(submit);
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription("Email address is required."),
    );
    expect(request).not.toHaveBeenCalled();

    await user.type(input, "alex@");
    await user.click(submit);
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription(
            "Enter a valid email address.",
        ),
    );
    expect(input).toHaveFocus();
    expect(input).toHaveValue("alex@");
    expect(request).toHaveBeenCalledTimes(1);
});

test("sends the address with CSRF protection and can reset confirmation without resending", async () => {
    const requests: { body: unknown; csrf: string | null }[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push({
                body: await request.json(),
                csrf: request.headers.get("X-XSRF-TOKEN"),
            });
            return HttpResponse.json(accepted, { status: 202 });
        }),
    );
    const user = openForm();
    await user.type(
        screen.getByRole("textbox", { name: "Email address" }),
        email,
    );
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
        await screen.findByRole("heading", { name: "Check your inbox" }),
    ).toHaveFocus();
    expect(screen.getByText(/If an account matches/)).toHaveTextContent(
        `If an account matches ${email}, we’ll send a password reset link.`,
    );
    expect(requests).toEqual([{ body: { email }, csrf: "test=token" }]);

    await user.click(screen.getByRole("button", { name: "Try another email" }));
    expect(
        screen.getByRole("heading", { name: "Forgot your password?" }),
    ).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(
        "",
    );
    expect(requests).toHaveLength(1);
});

test("removes an expired cooldown without resending and allows a deliberate retry", async () => {
    // Keep user-event and network scheduling real while advancing the countdown deterministically.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const request = vi
        .fn<() => Response>()
        .mockImplementationOnce(() =>
            HttpResponse.json(
                {},
                { status: 429, headers: { "Retry-After": "3" } },
            ),
        )
        .mockImplementation(() => HttpResponse.json(accepted, { status: 202 }));
    server.use(http.post(endpoint, request));
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Email address" });
    const submit = screen.getByRole("button", { name: "Send reset link" });
    await user.type(input, email);
    await user.click(submit);

    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(input).toHaveValue(email);
    expect(submit).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);

    await user.click(submit);
    expect(
        await screen.findByRole("heading", { name: "Check your inbox" }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
});

test.each([
    {
        name: "network failure",
        response: () => HttpResponse.error(),
        message: /Check your connection/,
    },
    {
        name: "server failure",
        response: () => HttpResponse.json({}, { status: 503 }),
        message: /Please try again in a moment/,
    },
    {
        name: "expired CSRF token",
        response: () => HttpResponse.json({}, { status: 419 }),
        message: /Your security token expired/,
    },
    {
        name: "malformed acceptance",
        response: () => HttpResponse.json({}, { status: 202 }),
        message: /Please try again in a moment/,
    },
    {
        name: "malformed validation",
        response: () =>
            HttpResponse.json({ errors: { email: [7] } }, { status: 422 }),
        message: /Please try again in a moment/,
    },
    {
        name: "unexpected success status",
        response: () => HttpResponse.json({}),
        message: /Please try again in a moment/,
    },
])(
    "recovers from $name without a false confirmation or lost input",
    async ({ response, message }) => {
        server.use(http.post(endpoint, response));
        const user = openForm();
        const input = screen.getByRole("textbox", { name: "Email address" });
        await user.type(input, email);
        await user.click(
            screen.getByRole("button", { name: "Send reset link" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
        expect(screen.getByRole("alert")).toHaveFocus();
        expect(
            screen.queryByRole("heading", { name: "Check your inbox" }),
        ).not.toBeInTheDocument();
        expect(input).toHaveValue(email);

        server.use(
            http.post(endpoint, () =>
                HttpResponse.json(accepted, { status: 202 }),
            ),
        );
        await user.click(
            screen.getByRole("button", { name: "Send reset link" }),
        );
        expect(
            await screen.findByRole("heading", { name: "Check your inbox" }),
        ).toBeInTheDocument();
    },
);

test("does not submit when CSRF bootstrap fails", async () => {
    server.use(
        http.get(
            "http://localhost/sanctum/csrf-cookie",
            () => new HttpResponse(null, { status: 503 }),
        ),
    );
    // A POST would be unhandled and fail this test, even if the application catches it.
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Email address" });
    await user.type(input, email);
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "We couldn’t confirm your request",
    );
    expect(input).toHaveValue(email);
});
