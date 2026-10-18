import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import { account } from "../../fixtures/account";
import { fillRegistration } from "../../support/forms";

const created = {
    data: {
        id: 1,
        name: account.name,
        email: account.email,
        email_verified: false,
    },
    meta: { verification_email_sent: true },
};

test("shows the branded ready state and supports keyboard password visibility", async ({
    page,
}) => {
    await expect(
        page.getByRole("img", { name: "Caseward", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("15–128 characters", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", {
            name: "Password requirements",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeEnabled();
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Show password", exact: true })
        .focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "type",
        "text",
    );
    await expect(
        page.getByLabel("Confirm password", { exact: true }),
    ).toHaveAttribute("type", "password");
    await expect(
        page.getByRole("button", { name: "Hide password", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "type",
        "password",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await checkAccessibility(page);
});

test("requires all fields and focuses the first invalid field", async ({
    page,
}) => {
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page.getByRole("alert")).toContainText(
        "Please fix the errors below",
    );
    await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
    for (const label of [
        "Full name",
        "Email address",
        "Password",
        "Confirm password",
    ]) {
        await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    }
    await expect(
        page.getByLabel("Full name", { exact: true }),
    ).toHaveAccessibleDescription("Full name is required.");
    await checkAccessibility(page);
});

test("prevents duplicate submissions, preserves passwords and confirms the server email", async ({
    page,
}) => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    let requests = 0;
    await page.route("**/api/register", async (route) => {
        requests++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        const payload: unknown = route.request().postDataJSON();
        expect(payload).toEqual(account);
        await pending;
        await mockSignedInSession(page, created.data);
        await route.fulfill({ status: 201, json: created });
    });
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    try {
        await expect(
            page.getByRole("button", {
                name: "Creating account…",
                exact: true,
            }),
        ).toBeDisabled();
        await expect(page.getByRole("form")).toHaveAttribute(
            "aria-busy",
            "true",
        );
        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toBeDisabled();
        await expect.poll(() => requests).toBe(1);
        await page.keyboard.press("Enter");
        expect(requests).toBe(1);
    } finally {
        release();
    }
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeFocused();
    const storage = await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
    }));
    expect(storage).toEqual({ local: [], session: [] });
    await checkAccessibility(page);
    expect(requests).toBe(1);
});

test("renders backend validation, retains values and recovers after correction", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        await route.fulfill({
            status: 422,
            json: {
                errors: {
                    email: ["An account with this email already exists."],
                    password: ["Password must be at least 15 characters long."],
                },
            },
        });
    });
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toHaveAccessibleDescription("An account with this email already exists.");
    await expect(
        page.getByLabel("Password", { exact: true }),
    ).toHaveAccessibleDescription(/Password must be at least 15/);
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        account.name,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, created.data);
        await route.fulfill({ status: 201, json: created });
    });
    await page
        .getByLabel("Email address", { exact: true })
        .fill("another@example.com");
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    // The confirmation uses the validated response, rather than echoing the submitted address.
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});

test("shows an accessible cooldown and enables a deliberate retry", async ({
    page,
}) => {
    await page.clock.install();
    await page.route("**/api/register", (route) =>
        route.fulfill({
            status: 429,
            headers: { "Retry-After": "3" },
            json: {},
        }),
    );
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Full name", { exact: true })).toBeDisabled();
    await checkAccessibility(page);
    await page.clock.fastForward(4_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("status").filter({ hasText: "You can try again now." }),
    ).toHaveText("You can try again now.");
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, created.data);
        await route.fulfill({ status: 201, json: created });
    });
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
});

test("focuses an accessible registration error and recovers without losing credentials", async ({
    page,
}) => {
    await page.route("**/api/register", (route) => route.abort("failed"));
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page.getByRole("alert")).toContainText(
        "We couldn’t confirm your account was created.",
    );
    await expect(page.getByRole("alert")).toContainText(
        "may still have reached us",
    );
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeEnabled();
    await checkAccessibility(page);
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, created.data);
        await route.fulfill({ status: 201, json: created });
    });
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
});
