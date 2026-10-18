import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import { password, user } from "../../fixtures/account";
import { fillLogin } from "../../support/forms";

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
    await fillLogin(page, { email: user.email, password });
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
    await fillLogin(page, { email: user.email, password });
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

test("focuses an accessible sign-in error and recovers without losing credentials", async ({
    page,
}) => {
    await page.route("**/api/login", (route) => route.abort("failed"));
    await page.goto("/login");
    await fillLogin(page, { email: user.email, password });
    const remember = page.getByRole("checkbox", {
        name: "Remember me for 30 days",
    });
    await remember.check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert")).toContainText(
        "We couldn’t confirm you were signed in.",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        password,
    );
    await expect(remember).toBeChecked();
    await checkAccessibility(page);
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({
            status: 204,
            headers: { "Set-Cookie": "XSRF-TOKEN=fresh-token; Path=/" },
        }),
    );
    await page.route("**/api/login", async (route) => {
        expect(route.request().headers()["x-xsrf-token"]).toBe("fresh-token");
        expect(route.request().postDataJSON()).toEqual({
            email: user.email,
            password,
            remember: true,
        });
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/workspaces/new");
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
