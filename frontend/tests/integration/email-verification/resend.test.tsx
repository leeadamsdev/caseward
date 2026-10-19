import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { waitingAction } from "~/features/email-verification/verification";
import { VerificationWaiting } from "~/features/email-verification/verification-waiting";
import { unverifiedUser } from "../../fixtures/email-verification";
import { server } from "../../support/http";

const endpoint = "http://localhost/api/email/verification-notification";
const resendLabel = "Resend verification email";

function openWaiting() {
    const Routes = createRoutesStub([
        {
            path: "/verify-email",
            Component: () => <VerificationWaiting user={unverifiedUser} />,
            action: waitingAction,
        },
    ]);
    render(<Routes initialEntries={["/verify-email"]} />);
    return userEvent.setup();
}

test("sends a protected request and blocks resends until the server cooldown ends without sending automatically", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const requests: { body: unknown; csrf: string | null }[] = [];
    server.use(
        http.post(endpoint, async ({ request }) => {
            requests.push({
                body: await request.json(),
                csrf: request.headers.get("X-XSRF-TOKEN"),
            });
            return HttpResponse.json(
                { message: "Verification email queued." },
                {
                    status: 202,
                    headers: { "Retry-After": "7" },
                },
            );
        }),
    );
    const user = openWaiting();
    await user.click(screen.getByRole("button", { name: resendLabel }));
    expect(
        await screen.findByText("Email queued", { exact: true }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: "Resend available in 0:07" }),
    ).toBeDisabled();
    expect(
        screen.getByRole("button", { name: "I’ve verified my email" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(requests).toEqual([{ body: {}, csrf: "test=token" }]);
    await act(() => vi.advanceTimersByTimeAsync(8_000));
    expect(screen.getByRole("button", { name: resendLabel })).toBeEnabled();
    expect(requests).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: resendLabel }));
    expect(
        await screen.findByRole("button", { name: "Resend available in 0:07" }),
    ).toBeDisabled();
    expect(requests).toHaveLength(2);
});

test.each([
    { name: "hourly", header: "3601", countdown: "60:01", advance: 3_602_000 },
    {
        name: "date",
        header: "Sat, 17 Oct 2026 12:01:01 GMT",
        countdown: "1:01",
        advance: 62_000,
    },
    { name: "missing", header: null, countdown: "1:00", advance: 61_000 },
])(
    "honours a $name rate limit without claiming delivery or automatically resending",
    async ({ header, countdown, advance }) => {
        vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
        vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
        const request = vi.fn(() =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                {
                    status: 429,
                    headers: header === null ? {} : { "Retry-After": header },
                },
            ),
        );
        server.use(http.post(endpoint, request));
        const user = openWaiting();
        await user.click(screen.getByRole("button", { name: resendLabel }));
        expect(
            await screen.findByRole("button", {
                name: `Resend available in ${countdown}`,
            }),
        ).toBeDisabled();
        expect(screen.getByText("Too many attempts")).toBeInTheDocument();
        expect(
            screen.queryByText("Email queued", { exact: true }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
        // Exercise expiry after a clock jump without simulating an hour of polling.
        vi.setSystemTime(Date.now() + advance);
        await act(() => vi.advanceTimersByTimeAsync(250));
        expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: resendLabel })).toBeEnabled();
        expect(request).toHaveBeenCalledTimes(1);
    },
);

test("reports a queue failure truthfully, preserves the account and allows retry after its cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const request = vi.fn(() =>
        HttpResponse.json(
            {
                code: "verification_queue_unavailable",
                message: "Private provider diagnostic",
            },
            { status: 503, headers: { "Retry-After": "3" } },
        ),
    );
    server.use(http.post(endpoint, request));
    const user = openWaiting();
    await user.click(screen.getByRole("button", { name: resendLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your account is saved.",
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(
        screen.getByText(unverifiedUser.email, { exact: true }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: "Resend available in 0:03" }),
    ).toBeDisabled();
    expect(
        screen.queryByText("Private provider diagnostic"),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByText("Email queued", { exact: true }),
    ).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(request).toHaveBeenCalledTimes(1);
    server.use(
        http.post(endpoint, () =>
            HttpResponse.json(
                { message: "Verification email queued." },
                { status: 202 },
            ),
        ),
    );
    await user.click(screen.getByRole("button", { name: resendLabel }));
    expect(
        await screen.findByText("Email queued", { exact: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test.each([
    { name: "network", response: () => HttpResponse.error() },
    {
        name: "server",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 503 },
            ),
    },
    {
        name: "expired CSRF",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 419 },
            ),
    },
    {
        name: "unexpected success",
        response: () => HttpResponse.json({ message: "Private diagnostic" }),
    },
    {
        name: "malformed queue acknowledgement",
        response: () => HttpResponse.json({ message: 123 }, { status: 202 }),
    },
])(
    "recovers from a $name response without claiming delivery",
    async ({ response }) => {
        const request = vi.fn(response);
        server.use(http.post(endpoint, request));
        const user = openWaiting();
        await user.click(screen.getByRole("button", { name: resendLabel }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(
            screen.queryByText("Email queued", { exact: true }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(request).toHaveBeenCalledTimes(1);
        server.use(
            http.post(endpoint, () =>
                HttpResponse.json(
                    { message: "Verification email queued." },
                    { status: 202 },
                ),
            ),
        );
        await user.click(screen.getByRole("button", { name: resendLabel }));
        expect(
            await screen.findByText("Email queued", { exact: true }),
        ).toBeInTheDocument();
    },
);

test("does not resend without a valid CSRF cookie", async () => {
    server.use(
        http.get(
            "http://localhost/sanctum/csrf-cookie",
            () => new HttpResponse(null, { status: 204 }),
        ),
    );
    const user = openWaiting();
    await user.click(screen.getByRole("button", { name: resendLabel }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(
        screen.queryByText("Email queued", { exact: true }),
    ).not.toBeInTheDocument();
});

test("an already-verified resend response continues to the workspace flow without claiming an email was queued", async () => {
    server.use(
        http.post(endpoint, () => new HttpResponse(null, { status: 204 })),
    );
    const request = new Request("http://localhost/verify-email", {
        method: "POST",
        body: new URLSearchParams({ intent: "resend" }),
    });
    const response = await waitingAction({ request });
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
        throw new Error("Expected a redirect.");
    expect(response.headers.get("Location")).toBe("/workspaces");
});
