import { expect, test } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession, mockSignedInSession } from "./browser-session";

const user = {
    id: 7,
    name: "Alex Chen",
    email: "alex.chen@example.com",
    email_verified: false,
};
const endpoint = "**/api/email/verification-notification";
const link = `/email/verify/7/${"a".repeat(40)}?expires=1790000000&signature=${"b".repeat(64)}`;

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
    await mockSignedInSession(page, user);
});
test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
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
        await route.fulfill({ status: 204, headers: { "Retry-After": "7" } });
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
            page.getByRole("button", { name: "Sending email…" }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "I’ve verified my email" }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Enter");
        expect(posts).toBe(1);
    } finally {
        release();
    }
    await expect(
        page.getByRole("status").filter({ hasText: "Email sent" }),
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

for (const [kind, retryAfter, countdown, advance] of [
    ["hourly", "3601", "60:01", 3_602_000],
    ["date", "Sat, 17 Oct 2026 12:01:01 GMT", "1:01", 62_000],
    ["missing", undefined, "1:00", 61_000],
] as const) {
    test(`honours a ${kind} rate limit without sending automatically or claiming delivery`, async ({
        page,
    }) => {
        await page.clock.install({ time: new Date("2026-10-17T12:00:00Z") });
        let posts = 0;
        await page.route(endpoint, async (route) => {
            posts++;
            await route.fulfill({
                status: 429,
                headers: retryAfter ? { "Retry-After": retryAfter } : {},
                json: { message: "Private diagnostic" },
            });
        });
        await page.goto("/verify-email");
        await page
            .getByRole("button", {
                name: "Resend verification email",
                exact: true,
            })
            .click();
        await expect(
            page.getByRole("button", {
                name: `Resend available in ${countdown}`,
            }),
        ).toBeDisabled();
        await expect(
            page.getByText("Too many attempts", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Email sent", { exact: true })).toHaveCount(
            0,
        );
        await expect(page.getByText("Private diagnostic")).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeEnabled();
        await checkAccessibility(page);
        await page.clock.fastForward(advance);
        await expect(
            page.getByText("Too many attempts", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("You can try again", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", {
                name: "Resend verification email",
                exact: true,
            }),
        ).toBeEnabled();
        expect(posts).toBe(1);
    });
}

test("recovers from initial and resend delivery failures without losing the account", async ({
    page,
}) => {
    await page.clock.install();
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 503,
            headers: { "Retry-After": "3" },
            json: {
                code: "verification_email_unavailable",
                message: "Private provider diagnostic",
            },
        }),
    );
    await page.goto("/verify-email?delivery=failed");
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
    await expect(page.getByText("Email sent", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Private provider diagnostic")).toHaveCount(0);
    await page.clock.fastForward(4_000);
    await page.route(endpoint, (route) =>
        route.fulfill({ status: 204, headers: { "Retry-After": "7" } }),
    );
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("status").filter({ hasText: "Email sent" }),
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

for (const failure of [
    "network",
    "server",
    "csrf",
    "unexpected-success",
] as const) {
    test(`recovers safely from a ${failure} resend response`, async ({
        page,
    }) => {
        await page.route(endpoint, async (route) => {
            if (failure === "network") await route.abort("failed");
            else
                await route.fulfill({
                    status:
                        failure === "csrf"
                            ? 419
                            : failure === "unexpected-success"
                              ? 200
                              : 503,
                    json: { message: "Private diagnostic" },
                });
        });
        await page.goto("/verify-email");
        await page
            .getByRole("button", {
                name: "Resend verification email",
                exact: true,
            })
            .click();
        await expect(page.getByRole("alert")).toBeFocused();
        await expect(page.getByText("Email sent", { exact: true })).toHaveCount(
            0,
        );
        await expect(page.getByText("Private diagnostic")).toHaveCount(0);
        await page.route(endpoint, (route) =>
            route.fulfill({ status: 204, headers: { "Retry-After": "7" } }),
        );
        await page
            .getByRole("button", {
                name: "Resend verification email",
                exact: true,
            })
            .click();
        await expect(
            page.getByText("Email sent", { exact: true }),
        ).toBeVisible();
    });
}

test("sends a new email directly from an expired link", async ({ page }) => {
    await page.route(`**/api${link}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "invalid_verification_link" },
        }),
    );
    await page.route(endpoint, (route) =>
        route.fulfill({ status: 204, headers: { "Retry-After": "60" } }),
    );
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(
        page.getByRole("status").filter({ hasText: "Email sent" }),
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
        route.fulfill({ status: 204, headers: { "Retry-After": "60" } }),
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
    await expect(page).toHaveURL("/account");
    await expect(
        page.getByText("Email verified", { exact: true }),
    ).toBeVisible();
});

test("does not post a resend without a valid CSRF cookie", async ({ page }) => {
    let posts = 0;
    await page.route(endpoint, async (route) => {
        posts++;
        await route.fulfill({ status: 204 });
    });
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({ status: 204 }),
    );
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    expect(posts).toBe(0);
});

test("fits a narrow screen with enlarged text and reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.route(endpoint, (route) =>
        route.fulfill({ status: 204, headers: { "Retry-After": "60" } }),
    );
    await page.goto("/verify-email");
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    await page
        .getByRole("button", { name: "Resend verification email", exact: true })
        .click();
    await expect(page.getByText("Email sent", { exact: true })).toBeVisible();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await checkAccessibility(page);
});
