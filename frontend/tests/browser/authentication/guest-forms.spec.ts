import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";

const email = "alex@example.com";

const password = "A sufficiently long recovery passphrase";

const forms = [
    {
        name: "registration",
        path: "/register",
        endpoint: "**/api/register",
        submit: "Create account",
        fields: {
            "Full name": "Alex Chen",
            "Email address": email,
            Password: password,
            "Confirm password": password,
        },
    },
    {
        name: "sign-in",
        path: "/login",
        endpoint: "**/api/login",
        submit: "Sign in",
        fields: { "Email address": email, Password: password },
    },
    {
        name: "recovery",
        path: "/forgot-password",
        endpoint: "**/api/forgot-password",
        submit: "Send reset link",
        fields: { "Email address": email },
    },
    {
        name: "reset",
        path: `/reset-password/${"a".repeat(64)}?email=${email}`,
        endpoint: "**/api/reset-password",
        submit: "Reset password",
        fields: {
            "New password": password,
            "Confirm new password": password,
        },
    },
] satisfies {
    name: string;
    path: string;
    endpoint: string;
    submit: string;
    fields: Record<string, string>;
}[];

test("retains local validation and entered fields during a session outage", async ({
    page,
}) => {
    await page.goto("/register");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.route("**/api/session", (route) =>
        route.fulfill({ status: 503, json: {} }),
    );
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        email,
    );
    await checkAccessibility(page);
});

test("keeps a rate-limited form and its expiry usable during a session outage", async ({
    page,
}) => {
    await page.clock.install();
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.route("**/api/session", (route) =>
        route.fulfill({ status: 503, json: {} }),
    );
    await page.route("**/api/login", (route) =>
        route.fulfill({
            status: 429,
            headers: { "Retry-After": "2" },
            json: {},
        }),
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeDisabled();
    await page.clock.fastForward(3_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        email,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        password,
    );
    await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
});

for (const form of forms) {
    test(`preserves ${form.name} input when submission and session services become unavailable`, async ({
        page,
    }) => {
        await page.goto(form.path);
        for (const [label, value] of Object.entries(form.fields)) {
            await page.getByLabel(label, { exact: true }).fill(value);
        }
        if (form.name === "sign-in") {
            await page
                .getByRole("checkbox", { name: "Remember me for 30 days" })
                .check();
        }
        await page.route("**/api/session", (route) =>
            route.fulfill({ status: 503, json: {} }),
        );
        await page.route(form.endpoint, (route) =>
            route.fulfill({ status: 503, json: {} }),
        );
        await page
            .getByRole("button", { name: form.submit, exact: true })
            .click();
        await expect(page.getByRole("alert")).toBeFocused();
        for (const [label, value] of Object.entries(form.fields)) {
            await expect(page.getByLabel(label, { exact: true })).toHaveValue(
                value,
            );
        }
        if (form.name === "sign-in") {
            await expect(
                page.getByRole("checkbox", {
                    name: "Remember me for 30 days",
                }),
            ).toBeChecked();
        }
        await expect(
            page.getByRole("button", { name: form.submit, exact: true }),
        ).toBeEnabled();
        await checkAccessibility(page);
    });
}
