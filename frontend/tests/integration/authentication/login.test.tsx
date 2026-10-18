import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { signIn } from "~/features/authentication/login";
import { LoginForm } from "~/features/authentication/login-form";
import { password, user as account } from "../../fixtures/account";
import { csrfCookie, server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/login";

function openForm() {
    const Routes = createRoutesStub([
        {
            path: "/login",
            Component: LoginForm,
            action: ({ request }) => signIn(request),
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={["/login"]} />);
    return userEvent.setup();
}

async function fillLogin(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
        screen.getByRole("textbox", { name: "Email address" }),
        account.email,
    );
    await user.type(
        screen.getByLabelText("Password", { exact: true }),
        password,
    );
}

test("keeps the remember choice and credentials through validation and allows opting out on retry", async () => {
    const requests: unknown[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push(await request.json());
            return HttpResponse.json(
                {
                    errors: {
                        email: ["These credentials do not match our records."],
                    },
                },
                { status: 422 },
            );
        }),
    );
    const user = openForm();
    const remember = screen.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
        expect(
            screen.getByLabelText("Password", { exact: true }),
        ).toHaveAccessibleDescription("Password is required."),
    );
    expect(
        screen.getByRole("textbox", { name: "Email address" }),
    ).toHaveFocus();
    expect(remember).toBeChecked();
    expect(requests).toHaveLength(0);
    await fillLogin(user);

    for (const checked of [true, false]) {
        if (!checked) await user.click(remember);
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        await waitFor(() => {
            expect(requests).toHaveLength(checked ? 1 : 2);
        });
        await waitFor(() =>
            expect(
                screen.getByRole("textbox", { name: "Email address" }),
            ).toHaveAccessibleDescription(
                "These credentials do not match our records.",
            ),
        );
        expect(remember).toHaveProperty("checked", checked);
        expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
            password,
        );
    }
    expect(requests).toEqual(
        [true, false].map((remember) => ({
            email: account.email,
            password,
            remember,
        })),
    );
});

test("preserves credentials and remember choice through cooldown without automatically replaying sign-in", async () => {
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
    await fillLogin(user);
    const remember = screen.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await user.click(remember);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(remember).toBeDisabled();
    expect(screen.getByLabelText("Password", { exact: true })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(
        screen.queryByText("You can try again", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
        password,
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(
        account.email,
    );
    expect(remember).toBeChecked();
    expect(remember).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        /^\/workspaces$/,
    );
    expect(request).toHaveBeenCalledTimes(2);
});

test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        title: "We couldn’t confirm you were signed in.",
    },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { errors: { email: "Internal diagnostic" } },
                { status: 503 },
            ),
        title: "We couldn’t confirm you were signed in.",
    },
    {
        name: "expired",
        response: () => HttpResponse.json({}, { status: 419 }),
        title: "Please try signing in again.",
    },
    {
        name: "malformed validation",
        response: () =>
            HttpResponse.json(
                { errors: { email: "Internal diagnostic" } },
                { status: 422 },
            ),
        title: "We couldn’t confirm you were signed in.",
    },
    {
        name: "HTML",
        response: () =>
            new HttpResponse("<h1>Internal diagnostic</h1>", {
                headers: { "Content-Type": "text/html" },
            }),
        title: "We couldn’t confirm you were signed in.",
    },
])(
    "recovers from $name failure with fresh CSRF protection and no lost credentials",
    async ({ response, title }) => {
        const requests: unknown[] = [];
        server.use(
            http.post(endpoint, async ({ request }) => {
                requests.push(await request.json());
                return response();
            }),
        );
        const user = openForm();
        await fillLogin(user);
        const remember = screen.getByRole("checkbox", {
            name: "Remember me for 30 days",
        });
        await user.click(remember);
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(title);
        expect(screen.getByRole("alert")).toHaveFocus();
        expect(
            screen.queryByText("Internal diagnostic"),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
            password,
        );
        expect(
            screen.getByRole("textbox", { name: "Email address" }),
        ).toHaveValue(account.email);
        expect(remember).toBeChecked();
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
        expect(requests).toEqual([
            { email: account.email, password, remember: true },
        ]);

        let csrf: string | null = null;
        server.use(
            csrfCookie("fresh-token"),
            http.post(endpoint, async ({ request }) => {
                csrf = request.headers.get("X-XSRF-TOKEN");
                requests.push(await request.json());
                return new HttpResponse(null, { status: 204 });
            }),
        );
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/workspaces$/,
        );
        expect(csrf).toBe("fresh-token");
        expect(requests).toEqual(
            Array.from({ length: 2 }, () => ({
                email: account.email,
                password,
                remember: true,
            })),
        );
    },
);

test.each([
    { name: "unavailable bootstrap", status: 503 },
    { name: "missing CSRF cookie", status: 204 },
])(
    "does not send credentials with $name and allows a protected retry",
    async ({ status }) => {
        server.use(
            http.get(
                "http://localhost/sanctum/csrf-cookie",
                () => new HttpResponse(null, { status }),
            ),
        );
        const user = openForm();
        await fillLogin(user);
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn’t confirm you were signed in.",
        );
        expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
            password,
        );
        // A credential POST before the bootstrap succeeds would be unhandled and fail the test.
        server.use(
            csrfCookie(),
            http.post(endpoint, () => new HttpResponse(null, { status: 204 })),
        );
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/workspaces$/,
        );
    },
);
