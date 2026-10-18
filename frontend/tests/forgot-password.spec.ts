import { expect, test } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession, mockSignedInSession } from "./browser-session";

const path = "/forgot-password";
const endpoint = "**/api/forgot-password";
const email = "alex+recovery@example.com";
const accepted = {
    message:
        "If an account matches that email address, we will send a password reset link.",
};

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
});
test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("opens recovery from sign-in using the keyboard and returns without submitting", async ({
    page,
}) => {
    await page.goto("/login");
    const recovery = page.getByRole("link", {
        name: "Forgot password?",
        exact: true,
    });
    await expect(recovery).toHaveAttribute("href", path);
    await expect(recovery).toHaveCSS("cursor", "pointer");
    await recovery.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveTitle("Forgot password | Caseward");
    await expect(
        page.getByRole("heading", { name: "Forgot your password?" }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toHaveAttribute("autocomplete", "email");
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL("/login");
});

test("validates empty input locally and presents backend errors with focus and preserved values", async ({
    page,
}) => {
    let requests = 0;
    await page.route(endpoint, async (route) => {
        requests++;
        await route.fulfill({
            status: 422,
            json: { errors: { email: ["Enter a valid email address."] } },
        });
    });
    await page.goto(path);
    const input = page.getByLabel("Email address", { exact: true });
    const submit = page.getByRole("button", {
        name: "Send reset link",
        exact: true,
    });
    await submit.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAccessibleDescription(
        "Email address is required.",
    );
    expect(requests).toBe(0);
    await input.fill("alex@");
    await submit.click();
    await expect(input).toHaveAccessibleDescription(
        "Enter a valid email address.",
    );
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("alex@");
    expect(requests).toBe(1);
    await checkAccessibility(page);
});

test("submits once with CSRF protection and confirms acceptance without promising delivery", async ({
    page,
}) => {
    let requests = 0;
    let release = () => {};
    const response = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(endpoint, async (route) => {
        requests++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        expect(route.request().postDataJSON()).toEqual({ email });
        await response;
        await route.fulfill({ status: 202, json: accepted });
    });
    await page.goto(path);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
    try {
        await expect(
            page.getByRole("button", {
                name: "Requesting reset link…",
                exact: true,
            }),
        ).toBeDisabled();
        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Enter");
        expect(requests).toBe(1);
    } finally {
        release();
    }
    await expect(
        page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeFocused();
    await expect(
        page.getByText(
            `If an account matches ${email}, we’ll send a password reset link.`,
            { exact: true },
        ),
    ).toBeVisible();
    await expect(page.getByText("Email sent", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(path);
    await checkAccessibility(page);
    await page
        .getByRole("button", { name: "Try another email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Forgot your password?" }),
    ).toBeFocused();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        "",
    );
    expect(requests).toBe(1);
});

test("dismisses an expired cooldown, preserves the address and lets the user retry", async ({
    page,
}) => {
    await page.clock.install();
    let requests = 0;
    await page.route(endpoint, async (route) => {
        requests++;
        await route.fulfill(
            requests === 1
                ? { status: 429, headers: { "Retry-After": "3" }, json: {} }
                : { status: 202, json: accepted },
        );
    });
    await page.goto(path);
    const input = page.getByLabel("Email address", { exact: true });
    const submit = page.getByRole("button", {
        name: "Send reset link",
        exact: true,
    });
    await input.fill(email);
    await submit.click();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(submit).toBeDisabled();
    await checkAccessibility(page);
    await page.clock.fastForward(4_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(email);
    await expect(submit).toBeEnabled();
    expect(requests).toBe(1);
    await submit.click();
    await expect(
        page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    expect(requests).toBe(2);
});

for (const failure of [
    "network",
    "server",
    "expired",
    "malformed-acceptance",
    "malformed-validation",
    "unexpected-success",
] as const) {
    test(`recovers from ${failure} without a false confirmation or losing the address`, async ({
        page,
    }) => {
        await page.route(endpoint, async (route) => {
            if (failure === "network") return route.abort("failed");
            await route.fulfill({
                status:
                    failure === "server"
                        ? 503
                        : failure === "expired"
                          ? 419
                          : failure === "malformed-acceptance"
                            ? 202
                            : failure === "malformed-validation"
                              ? 422
                              : 200,
                json:
                    failure === "malformed-validation"
                        ? { errors: { email: [7] } }
                        : {},
            });
        });
        await page.goto(path);
        const input = page.getByLabel("Email address", { exact: true });
        await input.fill(email);
        await page
            .getByRole("button", { name: "Send reset link", exact: true })
            .click();
        await expect(page.getByRole("alert")).toBeFocused();
        await expect(
            page.getByRole("heading", { name: "Check your inbox" }),
        ).toHaveCount(0);
        await expect(input).toHaveValue(email);
        if (failure === "network" || failure === "expired")
            await checkAccessibility(page);
        await page.route(endpoint, (route) =>
            route.fulfill({ status: 202, json: accepted }),
        );
        await page
            .getByRole("button", { name: "Send reset link", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "Check your inbox" }),
        ).toBeVisible();
    });
}

test("does not submit when CSRF bootstrap fails", async ({ page }) => {
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({ status: 503 }),
    );
    await page.goto(path);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        email,
    );
});

for (const verified of [false, true]) {
    test(`redirects a ${verified ? "verified" : "unverified"} session, including sign-in in another tab`, async ({
        page,
    }) => {
        const user = { id: 7, name: "Alex", email, email_verified: verified };
        await page.goto(path);
        await page.route(endpoint, async (route) => {
            await mockSignedInSession(page, user);
            await route.fulfill({ status: 403, json: {} });
        });
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page
            .getByRole("button", { name: "Send reset link", exact: true })
            .click();
        await expect(page).toHaveURL(
            verified ? "/workspaces/new" : "/verify-email",
        );
        await page.goto(path);
        await expect(page).toHaveURL(
            verified ? "/workspaces/new" : "/verify-email",
        );
    });
}

test("fits a narrow viewport and clears confirmation on reload without resending", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const longEmail = `${"a".repeat(64)}@${"b".repeat(60)}.example.com`;
    let requests = 0;
    await page.route(endpoint, async (route) => {
        requests++;
        await route.fulfill({ status: 202, json: accepted });
    });
    await page.goto(path);
    await checkAccessibility(page);
    await page.getByLabel("Email address", { exact: true }).fill(longEmail);
    await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
    await expect(page.getByText(longEmail, { exact: true })).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await checkAccessibility(page);
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Forgot your password?" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        "",
    );
    expect(requests).toBe(1);
    expect(
        await page.evaluate(() => ({
            local: localStorage.length,
            session: sessionStorage.length,
        })),
    ).toEqual({ local: 0, session: 0 });
});
