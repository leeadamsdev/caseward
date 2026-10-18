import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { isRecord } from "../../app/lib/api";

async function capturedMail(request: APIRequestContext, query: string) {
    let messageId: string | undefined;
    await expect
        .poll(
            async () => {
                const response = await request.get(
                    "http://mailpit:8025/api/v1/search",
                    { params: { query } },
                );
                expect(response.ok()).toBe(true);
                const body: unknown = await response.json();
                if (!isRecord(body) || !Array.isArray(body.messages))
                    throw new Error("Invalid Mailpit search response");
                const message: unknown = body.messages[0];
                if (message === undefined) return false;
                if (!isRecord(message) || typeof message.ID !== "string")
                    throw new Error("Invalid Mailpit message ID");
                messageId = message.ID;
                return true;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    if (!messageId) throw new Error("Email was not captured");
    const response = await request.get(
        `http://mailpit:8025/api/v1/message/${messageId}`,
    );
    expect(response.ok()).toBe(true);
    const message: unknown = await response.json();
    if (
        !isRecord(message) ||
        typeof message.HTML !== "string" ||
        typeof message.Text !== "string" ||
        typeof message.Subject !== "string"
    )
        throw new Error("Invalid Mailpit email content");
    return { html: message.HTML, text: message.Text, subject: message.Subject };
}

test("registers, verifies, signs in and recovers the password through Mailpit", async ({
    page,
    browser,
    request,
    baseURL,
}) => {
    if (!baseURL)
        throw new Error("Browser integration tests require a base URL");
    const email = `authentication-${randomUUID()}@caseward.test`;
    const name = "Authentication smoke test";
    const password = "A long authentication smoke passphrase";

    await page.goto("/register");
    // Without browser fetch metadata, Laravel must enforce the token fallback.
    const csrf = await request.post("/api/register", {
        headers: { Origin: baseURL, Accept: "application/json" },
        data: {},
    });
    expect(csrf.status()).toBe(419);
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL("/verify-email");

    const protectedStatus = () =>
        page.evaluate(
            async () =>
                (
                    await fetch("/api/user", {
                        headers: { Accept: "application/json" },
                    })
                ).status,
        );
    expect(await protectedStatus()).toBe(403);
    const message = await capturedMail(request, `to:${email}`);
    expect(message.subject).toBe("Verify your email | Caseward");
    const link = await page.evaluate(
        (html) =>
            new DOMParser()
                .parseFromString(html, "text/html")
                .querySelector("a")
                ?.getAttribute("href"),
        message.html,
    );
    if (!link) throw new Error("Verification email has no action link");
    const target = new URL(link);
    expect(target.origin).toBe(baseURL);
    expect(target.pathname).toMatch(/^\/email\/verify\/\d+\/[a-f0-9]{40}$/);
    expect(message.text).toContain(link);
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Confirm your email", exact: true }),
    ).toBeVisible();
    expect(await protectedStatus()).toBe(403);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continue to your account" }).click();
    await expect(page).toHaveURL("/account");
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/account");
    await expect(page).toHaveURL("/login?reason=session");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/account");
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page
        .getByRole("link", { name: "Forgot password?", exact: true })
        .click();
    await expect(page).toHaveURL("/forgot-password");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    await expect(
        page.getByText(
            `If an account matches ${email}, we’ll send a password reset link.`,
            { exact: true },
        ),
    ).toBeVisible();
    const resetMail = await capturedMail(
        request,
        `to:${email} subject:"Reset your password"`,
    );
    const resetLink = await page.evaluate(
        (html) =>
            new DOMParser()
                .parseFromString(html, "text/html")
                .querySelector('a[href*="/reset-password/"]')
                ?.getAttribute("href"),
        resetMail.html,
    );
    if (!resetLink) throw new Error("Reset email has no action link");
    const resetTarget = new URL(resetLink);
    expect(resetTarget.origin).toBe(baseURL);
    expect(resetTarget.pathname).toMatch(/^\/reset-password\/[a-f0-9]{64}$/);
    expect(resetTarget.searchParams.get("email")).toBe(email);
    expect(resetMail.text).toContain(resetLink);
    expect(resetMail.subject).toBe("Reset your password | Caseward");
    expect(resetMail.html).toContain('alt="Caseward"');
    expect(resetMail.text).toContain("expires in 30 minutes");
    expect(await protectedStatus()).toBe(401);

    const previousSession = await browser.newContext({ baseURL });
    try {
        const previousPage = await previousSession.newPage();
        await previousPage.goto("/login");
        await previousPage
            .getByLabel("Email address", { exact: true })
            .fill(email);
        await previousPage
            .getByLabel("Password", { exact: true })
            .fill(password);
        await previousPage
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(previousPage).toHaveURL("/account");

        const newPassword = "A new long recovery smoke passphrase 🔐";
        await page.goto(resetLink);
        await expect(
            page.getByRole("heading", {
                name: "Reset your password",
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByLabel("New password", { exact: true })
            .fill(newPassword);
        await page
            .getByLabel("Confirm new password", { exact: true })
            .fill(newPassword);
        await page
            .getByRole("button", { name: "Reset password", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "Password reset", exact: true }),
        ).toBeVisible();
        expect(await protectedStatus()).toBe(401);
        await previousPage.goto("/account");
        await expect(previousPage).toHaveURL("/login?reason=session");

        await page
            .getByRole("link", { name: "Back to sign in", exact: true })
            .click();
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(
            page.getByText("These credentials do not match our records.", {
                exact: true,
            }),
        ).toBeVisible();
        await page.getByLabel("Password", { exact: true }).fill(newPassword);
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(page).toHaveURL("/account");
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(page).toHaveURL("/login");

        await page.goto(resetLink);
        await page
            .getByLabel("New password", { exact: true })
            .fill(newPassword);
        await page
            .getByLabel("Confirm new password", { exact: true })
            .fill(newPassword);
        await page
            .getByRole("button", { name: "Reset password", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "This link is no longer valid" }),
        ).toBeVisible();
        expect(await previousPage.pageErrors()).toEqual([]);
    } finally {
        await previousSession.close();
    }
    expect(await page.pageErrors()).toEqual([]);
});
