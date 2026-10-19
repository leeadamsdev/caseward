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
    meta: { verification_email_queued: true },
};

test("animates the background and respects reduced motion", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const waves = page.locator(".brand-wave");
    const initialTransform = await waves
        .first()
        .evaluate((element) => getComputedStyle(element).transform);
    await expect
        .poll(() =>
            waves
                .first()
                .evaluate((element) => getComputedStyle(element).transform),
        )
        .not.toBe(initialTransform);
    await page.getByLabel("Full name", { exact: true }).fill(account.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        account.name,
    );
    await expect
        .poll(() => page.evaluate(() => document.getAnimations().length))
        .toBe(0);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test.describe("mobile validation", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("keeps the card unclipped when focusing an error", async ({
        page,
    }) => {
        await page.route("**/api/register", async (route) => {
            await route.fulfill({
                status: 422,
                json: { errors: { email: ["Enter a valid email address."] } },
            });
        });
        await fillRegistration(page, account);
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();

        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toBeFocused();
        await expect(page.getByRole("alert")).toBeVisible();
        expect(
            await page
                .getByRole("main")
                .evaluate((element) => [element.scrollLeft, element.scrollTop]),
        ).toEqual([0, 0]);
    });
});

test("works at narrow widths and increased zoom without horizontal scrolling", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    await checkAccessibility(page);
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    const longEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.example.com`;
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, { ...created.data, email: longEmail });
        await route.fulfill({
            status: 201,
            json: { ...created, data: { ...created.data, email: longEmail } },
        });
    });
    await fillRegistration(page, account);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(longEmail, { exact: true })).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
});
