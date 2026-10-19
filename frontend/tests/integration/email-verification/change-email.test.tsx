import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRoutesStub } from "react-router";
import { expect, test, vi } from "vitest";
import { changeEmail } from "~/features/email-verification/change-email";
import { ChangeEmailForm } from "~/features/email-verification/change-email-form";
import {
    correctedEmailUser as corrected,
    incorrectEmailUser as original,
} from "../../fixtures/email-verification";
import { server } from "../../support/http";
import { RouteDestination } from "../../support/route-destination";

const endpoint = "http://localhost/api/email";
const saveLabel = "Save and send verification email";
const saved = { data: corrected, meta: { verification_email_sent: true } };

function openForm() {
    const Routes = createRoutesStub([
        {
            path: "/verify-email/change",
            Component: () => <ChangeEmailForm user={original} />,
            action: changeEmail,
        },
        { path: "*", Component: RouteDestination },
    ]);
    render(<Routes initialEntries={["/verify-email/change"]} />);
    return userEvent.setup();
}

async function enterEmail(
    user: ReturnType<typeof userEvent.setup>,
    email = corrected.email,
) {
    const input = screen.getByRole("textbox", { name: "Email address" });
    await user.clear(input);
    await user.type(input, email);
    return input;
}

test("validates an empty address locally and preserves server validation until corrected", async () => {
    const request = vi.fn(() =>
        HttpResponse.json(
            { errors: { email: ["This email address is already in use."] } },
            { status: 422 },
        ),
    );
    server.use(http.patch(endpoint, request));
    const user = openForm();
    const input = screen.getByRole("textbox", { name: "Email address" });
    expect(input).toHaveValue(original.email);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: saveLabel }));
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription("Email address is required."),
    );
    expect(input).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
    await user.type(input, "taken@example.com");
    await user.click(screen.getByRole("button", { name: saveLabel }));
    await waitFor(() =>
        expect(input).toHaveAccessibleDescription(
            "This email address is already in use.",
        ),
    );
    expect(input).toHaveValue("taken@example.com");
    expect(input).toHaveFocus();
    expect(request).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
    "sends a protected account-bound PATCH and reports delivery %s through its destination",
    async (sent) => {
        const requests: { body: unknown; csrf: string | null }[] = [];
        server.use(
            http.patch(endpoint, async ({ request }) => {
                requests.push({
                    body: await request.json(),
                    csrf: request.headers.get("X-XSRF-TOKEN"),
                });
                return HttpResponse.json({
                    data: corrected,
                    meta: { verification_email_sent: sent },
                });
            }),
        );
        const user = openForm();
        await enterEmail(user, "ALEX@EXAMPLE.COM");
        await user.click(screen.getByRole("button", { name: saveLabel }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            sent
                ? /^\/verify-email\?updated=1$/
                : /^\/verify-email\?updated=1&delivery=failed$/,
        );
        expect(requests).toEqual([
            {
                body: {
                    email: "ALEX@EXAMPLE.COM",
                    account_id: original.id,
                },
                csrf: "test=token",
            },
        ]);
    },
);

test("preserves the typed address during cooldown and requires an explicit retry after expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const request = vi
        .fn<() => Response>()
        .mockImplementationOnce(() =>
            HttpResponse.json(
                {},
                { status: 429, headers: { "Retry-After": "3" } },
            ),
        )
        .mockImplementation(() => HttpResponse.json(saved));
    server.use(http.patch(endpoint, request));
    const user = openForm();
    const input = await enterEmail(user);
    const submit = screen.getByRole("button", { name: saveLabel });
    await user.click(submit);
    expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(input).toHaveValue(corrected.email);
    expect(submit).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(submit);
    expect(await screen.findByLabelText("Destination")).toHaveTextContent(
        /^\/verify-email\?updated=1$/,
    );
    expect(request).toHaveBeenCalledTimes(2);
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
        response: () => HttpResponse.json({}, { status: 419 }),
    },
    {
        name: "malformed success",
        response: () => HttpResponse.json({ message: "Private diagnostic" }),
    },
    {
        name: "missing delivery metadata",
        response: () => HttpResponse.json({ data: corrected }),
    },
    {
        name: "invalid validation",
        response: () =>
            HttpResponse.json(
                { message: "Private diagnostic" },
                { status: 422 },
            ),
    },
])(
    "recovers from $name without claiming an update or losing the address",
    async ({ response }) => {
        const request = vi.fn(response);
        server.use(http.patch(endpoint, request));
        const user = openForm();
        const input = await enterEmail(user);
        await user.click(screen.getByRole("button", { name: saveLabel }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn’t confirm your email address was updated.",
        );
        await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
        expect(
            screen.queryByText("Private diagnostic"),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
        expect(input).toHaveValue(corrected.email);
        expect(
            screen.getByRole("link", { name: "Check saved email address" }),
        ).toHaveAttribute("href", "/verify-email");
        expect(request).toHaveBeenCalledTimes(1);
        server.use(http.patch(endpoint, () => HttpResponse.json(saved)));
        await user.click(screen.getByRole("button", { name: saveLabel }));
        expect(await screen.findByLabelText("Destination")).toHaveTextContent(
            /^\/verify-email\?updated=1$/,
        );
        expect(request).toHaveBeenCalledTimes(1);
    },
);

test("does not send an update when the CSRF cookie is missing", async () => {
    server.use(
        http.get(
            "http://localhost/sanctum/csrf-cookie",
            () => new HttpResponse(null, { status: 204 }),
        ),
    );
    const user = openForm();
    await enterEmail(user);
    await user.click(screen.getByRole("button", { name: saveLabel }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(
        corrected.email,
    );
});

test.each(["", "0", "unexpected", "01", "9007199254740992"])(
    "rejects invalid account context %j before sending an update",
    async (context) => {
        const data = new FormData();
        data.set("email", corrected.email);
        data.set("account_id", context);
        expect(
            await changeEmail({
                request: new Request("http://localhost/verify-email/change", {
                    method: "POST",
                    body: data,
                }),
            }),
        ).toEqual({ status: "error", reason: "server" });
    },
);
