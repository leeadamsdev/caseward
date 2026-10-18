import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import {
    newPassword as password,
    resetCredentials,
    resetPath as path,
} from "../../fixtures/password-reset";
import { fillResetPasswords } from "../../support/forms";

const endpoint = "**/api/reset-password";
const { token, email } = resetCredentials;

test("opens without mutating the account and shares accessible password help and visibility controls", async ({
    page,
}) => {
    await page.goto(path);
    await expect(page).toHaveTitle("Reset password | Caseward");
    await expect(
        page.getByRole("heading", { name: "Reset your password", exact: true }),
    ).toBeFocused();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(
        page.getByLabel("New password", { exact: true }),
    ).toHaveAttribute("autocomplete", "new-password");
    await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
        0,
    );
    await expect(page.locator('input[name="token"]')).toHaveCount(0);
    const help = page.getByRole("button", {
        name: "Password requirements",
        exact: true,
    });
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(
        page.getByText("15–128 characters", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Show new password", exact: true })
        .click();
    await expect(
        page.getByLabel("New password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await checkAccessibility(page);
});

test("focuses an accessible invalid-link screen and opens recovery", async ({
    page,
}) => {
    await page.goto("/reset-password");
    await expect(
        page.getByRole("heading", { name: "This link is no longer valid" }),
    ).toBeFocused();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(
        0,
    );
    await checkAccessibility(page);
    await page
        .getByRole("link", { name: "Request a new link", exact: true })
        .click();
    await expect(page).toHaveURL("/forgot-password");
});

test("focuses accessible server validation and preserves both entered passwords", async ({
    page,
}) => {
    let requests = 0;
    await page.route(endpoint, async (route) => {
        requests++;
        await route.fulfill({
            status: 422,
            json: {
                errors: {
                    password: ["The password must be at least 15 characters."],
                },
            },
        });
    });
    await page.goto(path);
    const first = page.getByLabel("New password", { exact: true });
    const confirmation = page.getByLabel("Confirm new password", {
        exact: true,
    });
    await fillResetPasswords(page, "short");
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(first).toBeFocused();
    await expect(first).toHaveAccessibleDescription(
        "The password must be at least 15 characters.",
    );
    await expect(first).toHaveValue("short");
    await expect(confirmation).toHaveValue("short");
    expect(requests).toBe(1);
    await checkAccessibility(page);
});

test("submits once with the link, preserves password spaces, protects referrers and requires sign-in after success", async ({
    page,
}) => {
    let requests = 0;
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(endpoint, async (route) => {
        requests++;
        expect(route.request().postDataJSON()).toEqual({
            email,
            token,
            password,
            password_confirmation: password,
        });
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        expect(route.request().headers().referer).toBe(
            "http://127.0.0.1:4173/",
        );
        await pending;
        await route.fulfill({ status: 204 });
    });
    await page.goto(path);
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    try {
        await expect(
            page.getByRole("button", {
                name: "Resetting password…",
                exact: true,
            }),
        ).toBeDisabled();
        await expect(
            page.getByLabel("New password", { exact: true }),
        ).toBeDisabled();
        await expect.poll(() => requests).toBe(1);
        await page.keyboard.press("Enter");
        expect(requests).toBe(1);
    } finally {
        release();
    }
    await expect(
        page.getByRole("heading", { name: "Password reset", exact: true }),
    ).toBeFocused();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator(".success-confetti")).toHaveCount(0);
    await checkAccessibility(page);
    await page
        .getByRole("link", { name: "Back to sign in", exact: true })
        .click();
    await expect(page).toHaveURL("/login");
    expect(requests).toBe(1);
});

test("focuses an accessible screen when the server rejects the reset link", async ({
    page,
}) => {
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 422,
            json: { code: "invalid_password_reset_link" },
        }),
    );
    await page.goto(path);
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "This link is no longer valid" }),
    ).toBeFocused();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(
        0,
    );
    await checkAccessibility(page);
});

test("focuses an accessible network error and waits for a deliberate retry", async ({
    page,
}) => {
    let requests = 0;
    await page.route(endpoint, async (route) => {
        requests++;
        await route.abort("failed");
    });
    await page.goto(path);
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
        password,
    );
    await expect(
        page.getByLabel("Confirm new password", { exact: true }),
    ).toHaveValue(password);
    await expect(
        page.getByRole("heading", { name: "Password reset", exact: true }),
    ).toHaveCount(0);
    expect(requests).toBe(1);
    await checkAccessibility(page);
    await page.route(endpoint, async (route) => {
        requests++;
        await route.fulfill({ status: 204 });
    });
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Password reset", exact: true }),
    ).toBeFocused();
    expect(requests).toBe(2);
});

test("clears stale form feedback and passwords when another reset link is opened", async ({
    page,
}) => {
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 422,
            json: { code: "invalid_password_reset_link" },
        }),
    );
    await page.goto(path);
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "This link is no longer valid" }),
    ).toBeVisible();
    await page.goto(
        `/reset-password/${"b".repeat(64)}?email=another@example.com`,
    );
    await expect(
        page.getByRole("heading", { name: "Reset your password", exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
        "",
    );
    await expect(
        page.getByText("another@example.com", { exact: true }),
    ).toBeVisible();
});

test("redirects when another tab signs in before submission", async ({
    page,
}) => {
    await page.goto(path);
    await page.route(endpoint, async (route) => {
        await mockSignedInSession(page, {
            id: 7,
            name: "Alex",
            email,
            email_verified: false,
        });
        await route.fulfill({ status: 403, json: {} });
    });
    await fillResetPasswords(page, password);
    await page
        .getByRole("button", { name: "Reset password", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
});

test("fits narrow screens and enlarged text with reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(path);
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "20px";
    });
    await page
        .getByRole("button", { name: "Password requirements", exact: true })
        .click();
    await expect(
        page.getByText("15–128 characters", { exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await checkAccessibility(page);
    expect(
        await page.evaluate(() => ({
            local: localStorage.length,
            session: sessionStorage.length,
        })),
    ).toEqual({ local: 0, session: 0 });
});
