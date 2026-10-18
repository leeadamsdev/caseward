import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import { password, user } from "../../fixtures/account";
import { fillLogin } from "../../support/forms";

test("signs in once, restores the session on reload, guards guest pages and signs out", async ({
    page,
}) => {
    let release = () => {};
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
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.goto("/login");
    await fillLogin(page, { email: user.email, password });
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await remember.check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
        await expect(
            page.getByRole("button", { name: "Signing in…", exact: true }),
        ).toBeDisabled();
        await expect(remember).toBeChecked();
        await expect(remember).toBeDisabled();
        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toBeDisabled();
        await expect.poll(() => requests).toBe(1);
        await page.keyboard.press("Enter");
        expect(requests).toBe(1);
    } finally {
        release();
    }
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
    expect(requests).toBe(1);
});

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
    await mockSignedInSession(page, user);
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

test("recovers from an inaccessible session without exposing account data", async ({
    page,
}) => {
    await page.route("**/api/session", (route) => route.abort("failed"));
    await page.goto("/workspaces");
    await expect(
        page.getByRole("heading", {
            name: "Connection problem",
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.getByText("Internal diagnostic")).toHaveCount(0);
    await mockSignedInSession(page, user);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
});

test("treats an already expired session as signed out", async ({ page }) => {
    await mockSignedInSession(page, user);
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
