import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import {
    unverifiedUser as user,
    verificationLink as link,
} from "../../fixtures/email-verification";

const endpoint = "**/api/email/verification-notification";

test.beforeEach(async ({ page }) => {
    await mockSignedInSession(page, user);
});

test("sends once, honours the server cooldown and keeps verification checks and sign-out available", async ({
    page,
}) => {
    await page.clock.install();
    let release = () => {};
    const response = new Promise<void>((resolve) => {
        release = resolve;
    });
    let posts = 0;
    await page.route(endpoint, async (route) => {
        posts++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        expect(route.request().postDataJSON()).toEqual({});
        await response;
        await route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "7" },
        });
    });
    await page.goto("/verify-email");
    try {
        await page
            .getByRole("button", {
                name: "Resend verification email",
                exact: true,
            })
            .click();
        await expect(
            page.getByRole("button", { name: "Requesting email…" }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "I’ve verified my email" }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeDisabled();
        await expect.poll(() => posts).toBe(1);
        await page.keyboard.press("Enter");
        expect(posts).toBe(1);
    } finally {
        release();
    }
    await expect(
        page.getByRole("status").filter({ hasText: "Email queued" }),
    ).toBeFocused();
    await expect(
        page.getByRole("button", { name: "Resend available in 0:07" }),
    ).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "I’ve verified my email" }),
    ).toBeEnabled();
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "I’ve verified my email" }).click();
    await expect(page.getByText(/Your email isn’t verified yet/)).toBeVisible();
    expect(posts).toBe(1);
    await page.clock.fastForward(8_000);
    await expect(
        page.getByRole("button", {
            name: "Resend verification email",
            exact: true,
        }),
    ).toBeEnabled();
    expect(posts).toBe(1);
    await checkAccessibility(page);
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: /Resend available in/ }),
    ).toBeDisabled();
    expect(posts).toBe(2);
});

test("shows an accessible hourly resend limit without claiming delivery", async ({
    page,
}) => {
    await page.clock.install();
    let posts = 0;
    await page.route(endpoint, async (route) => {
        posts++;
        await route.fulfill({
            status: 429,
            headers: { "Retry-After": "3601" },
            json: { message: "Private diagnostic" },
        });
    });
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Resend available in 60:01" }),
    ).toBeDisabled();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Email queued", { exact: true })).toHaveCount(
        0,
    );
    await expect(page.getByText("Private diagnostic")).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    await checkAccessibility(page);
    await page.clock.fastForward(3_602_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", {
            name: "Resend verification email",
            exact: true,
        }),
    ).toBeEnabled();
    expect(posts).toBe(1);
});

test("recovers from initial and resend queue failures without losing the account", async ({
    page,
}) => {
    await page.clock.install();
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 503,
            headers: { "Retry-After": "3" },
            json: {
                code: "verification_queue_unavailable",
                message: "Private provider diagnostic",
            },
        }),
    );
    await page.goto("/verify-email?queue=failed");
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert")).toContainText(
        "Your account is saved.",
    );
    await expect(
        page.getByRole("button", { name: "Resend available in 0:03" }),
    ).toBeDisabled();
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    await expect(page.getByText("Email queued", { exact: true })).toHaveCount(
        0,
    );
    await expect(page.getByText("Private provider diagnostic")).toHaveCount(0);
    await page.clock.fastForward(4_000);
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "7" },
        }),
    );
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("status").filter({ hasText: "Email queued" }),
    ).toBeFocused();
    await expect(
        page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
        page.getByText("Your account is saved", { exact: true }),
    ).toHaveCount(0);
    await checkAccessibility(page);
    await expect(page).toHaveURL("/verify-email");
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(
        page.getByText("Your account is saved", { exact: true }),
    ).toHaveCount(0);
});

test("focuses an accessible resend error and supports retry without claiming delivery", async ({
    page,
}) => {
    await page.route(endpoint, (route) => route.abort("failed"));
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByText("Email queued", { exact: true })).toHaveCount(
        0,
    );
    await checkAccessibility(page);
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "7" },
        }),
    );
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("status").filter({ hasText: "Email queued" }),
    ).toBeFocused();
});

test("sends a new email directly from an expired link", async ({ page }) => {
    await page.route(`**/api${link}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "invalid_verification_link" },
        }),
    );
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "60" },
        }),
    );
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("status").filter({ hasText: "Email queued" }),
    ).toBeFocused();
    await expect(
        page.getByRole("button", { name: /Resend available in/ }),
    ).toBeDisabled();
    await expect(page).toHaveURL(link);
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Back to verification" }).click();
    await expect(page).toHaveURL("/verify-email");
});

test("retains an expired link when the resend session expires", async ({
    page,
}) => {
    await page.route(`**/api${link}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "invalid_verification_link" },
        }),
    );
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Link expired or invalid" }),
    ).toBeVisible();
    await page.route(endpoint, async (route) => {
        await page.unroute("**/api/session");
        await route.fulfill({ status: 401, json: {} });
    });
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(link);
});

test("observes the server limit after reload and stops at verified account access", async ({
    page,
}) => {
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "60" },
        }),
    );
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: /Resend available in/ }),
    ).toBeDisabled();
    await page.reload();
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 429,
            headers: { "Retry-After": "42" },
            json: {},
        }),
    );
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: /Resend available in/ }),
    ).toBeDisabled();
    await mockSignedInSession(page, { ...user, email_verified: true });
    await page.getByRole("button", { name: "I’ve verified my email" }).click();
    await expect(page).toHaveURL("/workspaces/new");
    await expect(
        page.getByRole("heading", { name: "Create a workspace", exact: true }),
    ).toBeVisible();
});

test("fits a narrow screen with enlarged text and reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 202,
            json: { message: "Verification email queued." },
            headers: { "Retry-After": "60" },
        }),
    );
    await page.goto("/verify-email");
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(page.getByText("Email queued", { exact: true })).toBeVisible();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await checkAccessibility(page);
});
