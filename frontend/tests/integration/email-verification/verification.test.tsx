import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { verifyEmail } from "~/features/email-verification/verification";
import { VerificationScreen } from "~/features/email-verification/verification-screen";
import {
    unverifiedUser,
    verificationLink,
} from "../../fixtures/email-verification";
import { csrfCookie, server } from "../../support/http";

const signedUrl = `http://localhost/api${verificationLink}`;
const endpoint = `http://localhost${new URL(signedUrl).pathname}`;

function openLink() {
    const Routes = createRoutesStub([
        {
            path: "/email/verify/:id/:hash",
            Component: () => (
                <VerificationScreen
                    user={unverifiedUser}
                    path={verificationLink}
                    accountId={unverifiedUser.id.toString()}
                />
            ),
            action: verifyEmail,
        },
    ]);
    render(<Routes initialEntries={[verificationLink]} />);
    return userEvent.setup();
}

test("verifies only after confirmation and preserves the signed query and CSRF protection", async () => {
    const requests: { url: string; body: unknown; csrf: string | null }[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push({
                url: request.url,
                body: await request.json(),
                csrf: request.headers.get("X-XSRF-TOKEN"),
            });
            return new HttpResponse(null, { status: 204 });
        }),
    );
    const user = openLink();
    expect(
        screen.getByRole("heading", { name: "Confirm your email" }),
    ).toHaveFocus();
    expect(requests).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Verify email" }));
    await waitFor(() =>
        expect(
            screen.getByRole("heading", { name: "Email verified" }),
        ).toHaveFocus(),
    );
    expect(requests).toEqual([
        { url: signedUrl, body: {}, csrf: "test=token" },
    ]);
    expect(
        screen.queryByRole("button", { name: "Verify email" }),
    ).not.toBeInTheDocument();
});

test.each([
    { code: "invalid_verification_link", title: "Link expired or invalid" },
    {
        code: "verification_email_mismatch",
        title: "Your email address changed",
    },
    {
        code: "verification_account_mismatch",
        title: "Different account signed in",
    },
])(
    "handles $code without exposing backend diagnostics or editable verification controls",
    async ({ code, title }) => {
        server.use(
            http.post(endpoint, () =>
                HttpResponse.json(
                    { code, message: "Private diagnostic" },
                    { status: 403 },
                ),
            ),
        );
        const user = openLink();
        await user.click(screen.getByRole("button", { name: "Verify email" }));
        await waitFor(() =>
            expect(screen.getByRole("heading", { name: title })).toHaveFocus(),
        );
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Verify email" }),
        ).not.toBeInTheDocument();
    },
);

test("removes an expired verification limit and requires a deliberate retry", async () => {
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
    const user = openLink();
    const submit = screen.getByRole("button", { name: "Verify email" });
    await user.click(submit);
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(submit).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(submit);
    expect(
        await screen.findByRole("heading", { name: "Email verified" }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
});

test.each([
    { name: "network", response: () => HttpResponse.error() },
    {
        name: "expired CSRF",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 419 },
            ),
    },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 503 },
            ),
    },
])(
    "recovers from $name without automatically replaying verification",
    async ({ response }) => {
        const request = vi.fn(response);
        server.use(http.post(endpoint, request));
        const user = openLink();
        await user.click(screen.getByRole("button", { name: "Verify email" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("heading", { name: "Email verified" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Check verification status" }),
        ).toBeEnabled();
        expect(request).toHaveBeenCalledTimes(1);
        server.use(
            csrfCookie("fresh-token"),
            http.post(endpoint, () => new HttpResponse(null, { status: 204 })),
        );
        await user.click(screen.getByRole("button", { name: "Verify email" }));
        expect(
            await screen.findByRole("heading", { name: "Email verified" }),
        ).toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
    },
);
