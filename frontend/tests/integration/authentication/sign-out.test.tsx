import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { signOut } from "~/features/authentication/session";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import { user as account } from "../../fixtures/account";
import { verificationLink } from "../../fixtures/email-verification";
import { csrfCookie, server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/logout";

function openForm(props: { returnTo?: string } = {}) {
    const Routes = createRoutesStub([
        {
            path: "/workspaces",
            Component: () => (
                <>
                    <p>{account.email}</p>
                    <SignOutForm {...props} />
                </>
            ),
            action: signOut,
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={["/workspaces"]} />);
    return userEvent.setup();
}

test.each([204, 401])(
    "finishes sign-out on %s using a protected POST",
    async (status) => {
        const requests: { body: unknown; csrf: string | null }[] = [];
        server.use(
            http.post(endpoint, async ({ request }) => {
                requests.push({
                    body: await request.json(),
                    csrf: request.headers.get("X-XSRF-TOKEN"),
                });
                return new HttpResponse(null, { status });
            }),
        );
        const user = openForm();
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/login$/,
        );
        expect(requests).toEqual([{ body: {}, csrf: "test=token" }]);
    },
);

test.each([
    {
        returnTo: verificationLink,
        destination: `/login?returnTo=${encodeURIComponent(verificationLink)}`,
    },
    { returnTo: "https://attacker.example", destination: "/login" },
])(
    "preserves only safe verification return targets: $returnTo",
    async ({ returnTo, destination }) => {
        server.use(
            http.post(endpoint, () => new HttpResponse(null, { status: 204 })),
        );
        const user = openForm({ returnTo });
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            destination,
        );
    },
);

test.each([
    {
        name: "network",
        response: () => HttpResponse.error(),
        message: "Check your connection and try again.",
    },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 503 },
            ),
        message: "Check your connection and try again.",
    },
    {
        name: "expired CSRF",
        response: () => HttpResponse.json({}, { status: 419 }),
        message: "Your security token expired. Please try again.",
    },
    {
        name: "unexpected success",
        response: () => HttpResponse.json({}),
        message: "Check your connection and try again.",
    },
])(
    "keeps $name sign-out failures recoverable without automatic replay or false success",
    async ({ response, message }) => {
        const request = vi.fn(response);
        server.use(http.post(endpoint, request));
        const user = openForm();
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(screen.getByRole("alert")).toHaveTextContent(message);
        expect(screen.getByText(account.email)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
        let csrf: string | null = null;
        server.use(
            csrfCookie("fresh-token"),
            http.post(endpoint, ({ request }) => {
                csrf = request.headers.get("X-XSRF-TOKEN");
                return new HttpResponse(null, { status: 204 });
            }),
        );
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/login$/,
        );
        expect(csrf).toBe("fresh-token");
        expect(request).toHaveBeenCalledTimes(1);
    },
);

test.each([204, 503])(
    "never sends a logout POST when CSRF bootstrap %s leaves no usable cookie",
    async (status) => {
        server.use(
            http.get(
                "http://localhost/sanctum/csrf-cookie",
                () => new HttpResponse(null, { status }),
            ),
        );
        const user = openForm();
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
        expect(screen.getByText(account.email)).toBeInTheDocument();
    },
);
