import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import {
    incorrectEmailUser as original,
    correctedEmailUser as corrected,
} from "../../fixtures/email-verification";

const path = "/verify-email/change";

const endpoint = "**/api/email";

const saveLabel = "Save and send verification email";

test.beforeEach(async ({ page }) => {
    await mockSignedInSession(page, original);
});

test("opens a prefilled accessible correction form and cancels without a mutation", async ({
    page,
}) => {
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Change email address", exact: true })
        .click();
    await expect(page).toHaveURL(path);
    await expect(
        page.getByRole("heading", { name: "Change email address" }),
    ).toBeFocused();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        original.email,
    );
    await checkAccessibility(page);
    await page
        .getByLabel("Email address", { exact: true })
        .fill(corrected.email);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.getByText(original.email, { exact: true })).toBeVisible();
});

test("validates required fields locally and preserves backend validation until corrected", async ({
    page,
}) => {
    let posts = 0;
    await page.route(endpoint, async (route) => {
        posts++;
        await route.fulfill({
            status: 422,
            json: {
                errors: { email: ["This email address is already in use."] },
            },
        });
    });
    await page.goto(path);
    const input = page.getByLabel("Email address", { exact: true });
    await input.clear();
    await page.getByRole("button", { name: saveLabel }).click();
    await expect(input).toBeFocused();
    await expect(
        page.getByText("Email address is required.", { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(0);
    await input.fill("taken@example.com");
    await page.getByRole("button", { name: saveLabel }).click();
    await expect(
        page.getByText("This email address is already in use.", {
            exact: true,
        }),
    ).toBeVisible();
    await expect(input).toHaveValue("taken@example.com");
    await expect(input).toBeFocused();
    await checkAccessibility(page);
    expect(posts).toBe(1);
});

for (const sent of [true, false]) {
    test(`saves the server-normalized address and reports delivery ${sent ? "success" : "failure"} truthfully`, async ({
        page,
    }) => {
        let posts = 0;
        let release = () => {};
        const response = new Promise<void>((resolve) => {
            release = resolve;
        });
        await page.route(endpoint, async (route) => {
            posts++;
            expect(route.request().method()).toBe("PATCH");
            expect(route.request().headers()["x-xsrf-token"]).toBe(
                "test=token",
            );
            expect(route.request().postDataJSON()).toEqual({
                account_id: "7",
                email: "ALEX@EXAMPLE.COM",
            });
            await response;
            await mockSignedInSession(page, corrected);
            await route.fulfill({
                json: {
                    data: corrected,
                    meta: { verification_email_sent: sent },
                },
            });
        });
        await page.goto(path);
        await page
            .getByLabel("Email address", { exact: true })
            .fill("ALEX@EXAMPLE.COM");
        await page.getByRole("button", { name: saveLabel }).click();
        try {
            await expect(
                page.getByRole("button", { name: "Saving email…" }),
            ).toBeDisabled();
            await expect(
                page.getByRole("button", { name: "Cancel", exact: true }),
            ).toBeDisabled();
            await expect.poll(() => posts).toBe(1);
            await page.keyboard.press("Enter");
            expect(posts).toBe(1);
        } finally {
            release();
        }
        await expect(page).toHaveURL(
            sent
                ? "/verify-email?updated=1"
                : "/verify-email?updated=1&delivery=failed",
        );
        await expect(
            page.getByText(corrected.email, { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(original.email, { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("Email address saved", { exact: true }),
        ).toBeVisible();
        if (!sent) {
            await expect(
                page.getByText(/address was updated, but/),
            ).toBeVisible();
            await page.route(
                "**/api/email/verification-notification",
                (route) =>
                    route.fulfill({
                        status: 204,
                        headers: { "Retry-After": "60" },
                    }),
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
            await expect(page).toHaveURL("/verify-email?updated=1");
        }
        await checkAccessibility(page);
        expect(posts).toBe(1);
    });
}

test("checks the authoritative saved address after an interrupted response without replaying the mutation", async ({
    page,
}) => {
    let posts = 0;
    await page.route(endpoint, async (route) => {
        posts++;
        await mockSignedInSession(page, corrected);
        await route.abort("failed");
    });
    await page.goto(path);
    await page
        .getByLabel("Email address", { exact: true })
        .fill(corrected.email);
    await page.getByRole("button", { name: saveLabel }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Check saved email address" }).click();
    await expect(page).toHaveURL("/verify-email");
    await expect(
        page.getByText(corrected.email, { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(1);
});

for (const state of [
    "guest",
    "verified",
    "expired",
    "verified-during-save",
] as const) {
    test(`handles ${state} access safely`, async ({ page }) => {
        if (state === "guest") await page.unroute("**/api/session");
        if (state === "verified")
            await mockSignedInSession(page, {
                ...original,
                email_verified: true,
            });
        await page.goto(path);
        if (state === "guest" || state === "verified") {
            await expect(page).toHaveURL(
                state === "guest" ? "/login?reason=session" : "/workspaces/new",
            );
            return;
        }
        await page.route(endpoint, async (route) => {
            if (state === "expired") {
                await page.unroute("**/api/session");
                await route.fulfill({ status: 401, json: {} });
            } else {
                await mockSignedInSession(page, {
                    ...original,
                    email_verified: true,
                });
                await route.fulfill({
                    status: 403,
                    json: { code: "email_already_verified" },
                });
            }
        });
        await page.getByRole("button", { name: saveLabel }).click();
        await expect(page).toHaveURL(
            state === "expired" ? "/login?reason=session" : "/workspaces/new",
        );
    });
}

test("recovers from an account switch without applying the stale form to the new account", async ({
    page,
}) => {
    const other = { ...original, id: 8, email: "other@example.com" };
    await page.goto(path);
    await page
        .getByLabel("Email address", { exact: true })
        .fill(corrected.email);
    await page.route(endpoint, async (route) => {
        expect(route.request().postDataJSON()).toEqual({
            account_id: "7",
            email: corrected.email,
        });
        await mockSignedInSession(page, other);
        await route.fulfill({
            status: 409,
            json: { code: "account_context_changed" },
        });
    });
    await page.getByRole("button", { name: saveLabel }).click();
    await expect(page).toHaveURL("/verify-email?account=changed");
    await expect(page.getByText(other.email, { exact: true })).toBeVisible();
    await expect(
        page.getByText("Your signed-in account changed", { exact: true }),
    ).toBeVisible();
    await checkAccessibility(page);
    await page
        .getByRole("button", { name: "Change email address", exact: true })
        .click();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        other.email,
    );
});

test("does not redirect away after the user leaves an in-flight correction", async ({
    page,
}) => {
    let release = () => {};
    const response = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.goto("/verify-email");
    await page
        .getByRole("button", { name: "Change email address", exact: true })
        .click();
    await page.route(endpoint, async (route) => {
        await response;
        await route.fulfill({
            json: { data: corrected, meta: { verification_email_sent: true } },
        });
    });
    await page.getByRole("button", { name: saveLabel }).click();
    await expect(
        page.getByRole("button", { name: /Saving email/ }),
    ).toBeDisabled();
    await page.goBack();
    await expect(page).toHaveURL("/verify-email");
    release();
    await expect(
        page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page).toHaveURL("/verify-email");
});

test("fits narrow screens with enlarged text and reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(path);
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await checkAccessibility(page);
});
