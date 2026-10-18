import { expect, test, type Page } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession, mockSignedInSession } from "./browser-session";

const user = {
    id: 7,
    name: "Alex Chen",
    email: "alex.chen@example.com",
    email_verified: true,
};
const password = "  a long Unicode passphrase 🔐  ";

async function fillLogin(page: Page) {
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
}

async function authenticatedSession(page: Page) {
    await mockSignedInSession(page, user);
}

test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
});

test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("provides consistent navigation, keyboard controls and accessible sign-in", async ({
    page,
}) => {
    await page.goto("/register");
    const signIn = page.getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toHaveAttribute("href", "/login");
    await expect(signIn).toHaveCSS("cursor", "pointer");
    await signIn.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/login");
    await expect(page).toHaveTitle("Sign in | Caseward");
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "autocomplete",
        "current-password",
    );
    await expect(page.getByText("Password requirements")).toHaveCount(0);
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await expect(remember).not.toBeChecked();
    await expect(remember).toHaveCSS("cursor", "pointer");
    await fillLogin(page);
    await page
        .getByRole("button", { name: "Show password", exact: true })
        .focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "type",
        "text",
    );
    await page.keyboard.press("Tab");
    await expect(remember).toBeFocused();
    await page.keyboard.press("Space");
    await expect(remember).toBeChecked();
    await checkAccessibility(page);
    await page
        .getByRole("link", { name: "Create an account", exact: true })
        .click();
    await expect(page).toHaveURL("/register");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(remember).not.toBeChecked();
});

test("validates required fields locally and preserves backend credential errors", async ({
    page,
}) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toHaveAccessibleDescription("Email address is required.");
    await expect(
        page.getByLabel("Password", { exact: true }),
    ).toHaveAccessibleDescription("Password is required.");
    await page.route("**/api/login", async (route) => {
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        expect(route.request().postDataJSON()).toEqual({
            email: user.email,
            password,
            remember: false,
        });
        await route.fulfill({
            status: 422,
            json: {
                errors: {
                    email: ["These credentials do not match our records."],
                },
            },
        });
    });
    await fillLogin(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toHaveAccessibleDescription(
        "These credentials do not match our records.",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        password,
    );
    await checkAccessibility(page);
});

test("signs in once, restores the session on reload, guards guest pages and signs out", async ({
    page,
}) => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    let requests = 0;
    await page.route("**/api/login", async (route) => {
        requests++;
        expect(route.request().postDataJSON()).toEqual({
            email: user.email,
            password,
            remember: true,
        });
        await pending;
        await authenticatedSession(page);
        await route.fulfill({ status: 204 });
    });
    await page.goto("/login");
    await fillLogin(page);
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await remember.check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Signing in…", exact: true }),
    ).toBeDisabled();
    await expect(remember).toBeChecked();
    await expect(remember).toBeDisabled();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(requests).toBe(1);
    release?.();
    await expect(page).toHaveURL("/workspaces/new");
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await page.reload();
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    for (const path of ["/register", "/login"]) {
        await page.goto(path);
        await expect(page).toHaveURL("/workspaces/new");
    }
    await checkAccessibility(page);
    expect(
        await page.evaluate(() => ({
            local: Object.keys(localStorage),
            session: Object.keys(sessionStorage),
        })),
    ).toEqual({ local: [], session: [] });
    await page.route("**/api/logout", async (route) => {
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        await page.unroute("**/api/session");
        await route.fulfill({ status: 204 });
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/workspaces");
    await expect(page).toHaveURL("/login?reason=session");
    await expect(
        page.getByText(
            "Please sign in to continue. Your session may have expired.",
        ),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(remember).not.toBeChecked();
});

test("preserves the choice through validation and allows opting out before retrying", async ({
    page,
}) => {
    await page.goto("/login");
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await remember.check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(remember).toBeChecked();
    await fillLogin(page);

    for (const checked of [true, false]) {
        await remember.setChecked(checked);
        await page.route("**/api/login", async (route) => {
            expect(route.request().postDataJSON()).toEqual({
                email: user.email,
                password,
                remember: checked,
            });
            await route.fulfill({
                status: 422,
                json: {
                    errors: {
                        email: ["These credentials do not match our records."],
                    },
                },
            });
        });
        const response = page.waitForResponse("**/api/login");
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        expect((await response).status()).toBe(422);
        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toHaveAccessibleDescription(
            "These credentials do not match our records.",
        );
        await expect(remember).toBeChecked({ checked });
        await page.unroute("**/api/login");
    }
});

test("honours rate limits without losing entered credentials", async ({
    page,
}) => {
    await page.clock.install({ time: new Date("2026-10-17T12:00:00Z") });
    await page.route("**/api/login", (route) =>
        route.fulfill({
            status: 429,
            headers: { "Retry-After": "3" },
            json: {},
        }),
    );
    await page.goto("/login");
    await fillLogin(page);
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await remember.check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(remember).toBeDisabled();
    await page.clock.fastForward(4_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByText("You can try again", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        password,
    );
    await expect(remember).toBeChecked();
    await expect(remember).toBeEnabled();
    await checkAccessibility(page);
});

for (const failure of [
    "network",
    "server",
    "expired",
    "malformed",
    "html",
    "csrf",
]) {
    test(`handles ${failure} failure safely and supports manual retry`, async ({
        page,
    }) => {
        let requests = 0;
        if (failure === "csrf")
            await page.route("**/sanctum/csrf-cookie", (route) =>
                route.fulfill({ status: 503, json: {} }),
            );
        await page.route("**/api/login", async (route) => {
            requests++;
            if (failure === "network") await route.abort("failed");
            else if (failure === "html")
                await route.fulfill({
                    status: 200,
                    contentType: "text/html",
                    body: "<h1>Internal diagnostic</h1>",
                });
            else
                await route.fulfill({
                    status:
                        failure === "expired"
                            ? 419
                            : failure === "malformed"
                              ? 422
                              : 503,
                    json: { errors: { email: "Internal diagnostic" } },
                });
        });
        await page.goto("/login");
        await fillLogin(page);
        const remember = page.getByRole("checkbox", {
            name: "Remember me for 30 days",
        });
        await remember.check();
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(page.getByRole("alert")).toBeFocused();
        await expect(page.getByRole("alert")).toContainText(
            failure === "expired"
                ? "Please try signing in again."
                : "We couldn’t confirm you were signed in.",
        );
        await expect(page.getByText("Internal diagnostic")).toHaveCount(0);
        await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
            password,
        );
        await expect(remember).toBeChecked();
        expect(requests).toBe(failure === "csrf" ? 0 : 1);
        await page.route("**/sanctum/csrf-cookie", (route) =>
            route.fulfill({
                status: 204,
                headers: { "Set-Cookie": "XSRF-TOKEN=fresh-token; Path=/" },
            }),
        );
        await page.route("**/api/login", async (route) => {
            expect(route.request().headers()["x-xsrf-token"]).toBe(
                "fresh-token",
            );
            expect(route.request().postDataJSON()).toEqual({
                email: user.email,
                password,
                remember: true,
            });
            await authenticatedSession(page);
            await route.fulfill({ status: 204 });
        });
        await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
        await expect(page).toHaveURL("/workspaces/new");
    });
}

for (const path of ["/login", "/workspaces"]) {
    test(`does not confuse a failed session check with being signed out at ${path}`, async ({
        page,
    }) => {
        await page.route("**/api/session", (route) =>
            route.fulfill({ status: 503, json: {} }),
        );
        await page.goto(path);
        await expect(
            page.getByRole("heading", {
                name: "Connection problem",
                exact: true,
            }),
        ).toBeVisible();
        await expect(page).toHaveURL(path);
        await expect(page.getByLabel("Password", { exact: true })).toHaveCount(
            0,
        );
        await page.unroute("**/api/session");
        await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "Sign in", exact: true }),
        ).toBeVisible();
    });
}

test("keeps sign-out failures recoverable and handles a session expiring", async ({
    page,
}) => {
    await authenticatedSession(page);
    await page.route("**/api/logout", (route) =>
        route.fulfill({ status: 419, json: {} }),
    );
    await page.goto("/workspaces");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    await page.unroute("**/api/session");
    await page.reload();
    await expect(page).toHaveURL("/login?reason=session");
});

for (const failure of ["network", "malformed"]) {
    test(`recovers from a ${failure} session response without exposing account data`, async ({
        page,
    }) => {
        await page.route("**/api/session", async (route) => {
            if (failure === "network") await route.abort("failed");
            else
                await route.fulfill({
                    json: {
                        data: { ...user, id: "7", name: "Internal diagnostic" },
                    },
                });
        });
        await page.goto("/workspaces");
        await expect(
            page.getByRole("heading", {
                name: "Connection problem",
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByText("Internal diagnostic")).toHaveCount(0);
        await authenticatedSession(page);
        await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
        await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    });
}

test("refuses a session mutation when the CSRF cookie is missing", async ({
    page,
}) => {
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({ status: 204 }),
    );
    await page.goto("/login");
    await fillLogin(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page).toHaveURL("/login");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        password,
    );
});

test("treats an already expired session as signed out", async ({ page }) => {
    await authenticatedSession(page);
    await page.route("**/api/logout", async (route) => {
        await page.unroute("**/api/session");
        await route.fulfill({
            status: 401,
            json: { message: "Unauthenticated." },
        });
    });
    await page.goto("/workspaces");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("fits small screens and increased text size with reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    await expect(
        page.getByRole("link", { name: "Create an account", exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    const form = await page
        .getByRole("form", { name: "Sign in", exact: true })
        .boundingBox();
    if (!form) throw new Error("Sign-in form is not visible");
    for (const control of [
        page.locator('label[for="remember"]'),
        page.getByRole("link", { name: "Forgot password?", exact: true }),
    ]) {
        const bounds = await control.boundingBox();
        if (!bounds) throw new Error("Sign-in control is not visible");
        expect(bounds.x).toBeGreaterThanOrEqual(form.x - 1);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            form.x + form.width + 1,
        );
    }
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await checkAccessibility(page);
});
