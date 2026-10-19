import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { expect, test, type BrowserContext } from "@playwright/test";
import {
    fillLogin,
    fillRegistration,
    fillResetPasswords,
    signIn,
} from "../support/forms";
import { capturedMail } from "./support/mailpit";
import { protectedStatus, sessionCookieExpiry } from "./support/session";

test("registers, verifies, recovers a password and creates a workspace through Mailpit", async ({
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
    await fillRegistration(page, {
        name,
        email,
        password,
        password_confirmation: password,
    });
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.goto("/workspaces");
    await expect(page).toHaveURL("/verify-email");

    expect(await protectedStatus(page)).toBe(403);
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
    expect(await protectedStatus(page)).toBe(403);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continue to workspaces" }).click();
    await expect(page).toHaveURL("/workspaces/new");
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Create a workspace", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/workspaces");
    await expect(page).toHaveURL("/login?reason=session");
    await signIn(page, { email, password });
    await expect(page).toHaveURL("/workspaces/new");
    const ordinaryCookie = (await page.context().cookies()).find(
        (cookie) => cookie.name === "caseward_session",
    );
    expect(ordinaryCookie?.expires).toBe(-1);
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
    expect(await protectedStatus(page)).toBe(401);

    const profile = test.info().outputPath("remembered-browser");
    const openRememberedBrowser = () =>
        browser.browserType().launchPersistentContext(profile, { baseURL });
    let previousSession: BrowserContext | undefined;
    try {
        previousSession = await openRememberedBrowser();
        let previousPage = await previousSession.newPage();
        await previousPage.goto("/login");
        await fillLogin(previousPage, { email, password });
        await previousPage
            .getByRole("checkbox", { name: "Remember me for 30 days" })
            .check();
        const signInResponse = previousPage.waitForResponse("**/api/login");
        await previousPage
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        const deadline = await sessionCookieExpiry(await signInResponse);
        await expect(previousPage).toHaveURL("/workspaces/new");
        const rememberedCookie = (await previousSession.cookies()).find(
            (cookie) => cookie.name === "caseward_session",
        );
        expect(rememberedCookie).toBeDefined();
        expect(rememberedCookie?.httpOnly).toBe(true);
        expect(rememberedCookie?.sameSite).toBe("Lax");
        expect(rememberedCookie?.expires).toBeGreaterThan(
            Date.now() / 1000 + 29 * 24 * 60 * 60,
        );
        await previousSession.close();
        previousSession = await openRememberedBrowser();
        previousPage = await previousSession.newPage();
        const restoredSession = previousPage.waitForResponse("**/api/session");
        await previousPage.goto("/workspaces");
        await expect(previousPage).toHaveURL("/workspaces/new");
        await expect(
            previousPage.getByText(email, { exact: true }),
        ).toBeVisible();
        // Expires is exact; Chromium derives fractional expiry from Max-Age at receipt time.
        expect(await sessionCookieExpiry(await restoredSession)).toBe(deadline);

        const newPassword = "A new long recovery smoke passphrase 🔐";
        await page.goto(resetLink);
        await expect(
            page.getByRole("heading", {
                name: "Reset your password",
                exact: true,
            }),
        ).toBeVisible();
        await fillResetPasswords(page, newPassword);
        await page
            .getByRole("button", { name: "Reset password", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "Password reset", exact: true }),
        ).toBeVisible();
        expect(await protectedStatus(page)).toBe(401);
        const confirmation = await capturedMail(
            request,
            `to:${email} subject:"Your password was reset"`,
        );
        expect(confirmation.subject).toBe("Your password was reset | Caseward");
        expect(confirmation.html).toContain('alt="Caseward"');
        for (const content of [confirmation.html, confirmation.text]) {
            expect(content).toContain(email);
            expect(content).toContain(`${baseURL}/forgot-password`);
            expect(content).toContain("no further action is needed");
            expect(content).toContain("Existing sessions have been signed out");
            expect(content).not.toContain(resetTarget.pathname);
            expect(content).not.toContain(password);
            expect(content).not.toContain(newPassword);
        }
        await previousPage.goto("/workspaces");
        await expect(previousPage).toHaveURL("/login?reason=session");

        await page
            .getByRole("link", { name: "Back to sign in", exact: true })
            .click();
        await signIn(page, { email, password });
        await expect(
            page.getByText("These credentials do not match our records.", {
                exact: true,
            }),
        ).toBeVisible();
        await page.getByLabel("Password", { exact: true }).fill(newPassword);
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(page).toHaveURL("/workspaces/new");
        await page
            .getByLabel("Workspace name", { exact: true })
            .fill("Authentication smoke workspace");
        await page
            .getByRole("button", { name: "Create workspace", exact: true })
            .click();
        await expect(page).toHaveURL(/\/w\/[0-7][0-9a-hjkmnp-tv-z]{25}$/);
        await expect(
            page.getByRole("heading", {
                name: "Authentication smoke workspace",
                exact: true,
            }),
        ).toBeVisible();
        const workspaceUrl = page.url();
        await page.getByRole("link", { name: "View members" }).click();
        await expect(
            page.getByRole("heading", { name: "Workspace members" }),
        ).toBeVisible();
        const invitee = `invitation-${randomUUID()}@caseward.test`;
        await page.getByRole("button", { name: "Invite colleague" }).click();
        await page
            .getByRole("textbox", { name: "Email address" })
            .fill(invitee);
        await page.getByRole("button", { name: "Send invitation" }).click();
        await expect(
            page.getByText("Invitation queued", { exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Done", exact: true }).click();
        const invitationMail = await capturedMail(request, `to:${invitee}`);
        expect(invitationMail.subject).toBe("Workspace invitation | Caseward");
        expect(invitationMail.html).toContain('alt="Caseward"');
        expect(invitationMail.text).toContain("Authentication smoke workspace");
        expect(invitationMail.text).toMatch(/\/invitations\/[a-f0-9]{64}/);
        await expect(
            page.getByRole("button", {
                name: `Resend invitation to ${invitee}`,
            }),
        ).toBeDisabled();
        await page
            .getByRole("button", { name: `Revoke invitation for ${invitee}` })
            .click();
        await page
            .getByRole("button", { name: "Revoke invitation", exact: true })
            .click();
        await expect(
            page.getByText(/No outstanding invitations/),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Invitations", exact: true }),
        ).toBeFocused();
        await page
            .getByRole("link", { name: "Back to workspace", exact: true })
            .click();
        await expect(page).toHaveURL(workspaceUrl);
        await page.reload();
        await expect(page).toHaveURL(workspaceUrl);
        await page
            .getByRole("link", { name: "Choose a workspace", exact: true })
            .click();
        await expect(page).toHaveURL("/workspaces");
        await page.goto("/login");
        await expect(page).toHaveURL("/workspaces");
        await page
            .getByRole("link", {
                name: "Open Authentication smoke workspace",
                exact: true,
            })
            .click();
        await expect(page).toHaveURL(workspaceUrl);
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(page).toHaveURL("/login");

        await signIn(page, { email, password: newPassword });
        await expect(page).toHaveURL("/workspaces");
        await expect(
            page.getByRole("link", {
                name: "Open Authentication smoke workspace",
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(page).toHaveURL("/login");

        await page.goto(resetLink);
        await fillResetPasswords(page, newPassword);
        await page
            .getByRole("button", { name: "Reset password", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "This link is no longer valid" }),
        ).toBeVisible();
        expect(await previousPage.pageErrors()).toEqual([]);
    } finally {
        try {
            await previousSession?.close();
        } finally {
            await rm(profile, { recursive: true, force: true });
        }
    }
    expect(await page.pageErrors()).toEqual([]);
});
