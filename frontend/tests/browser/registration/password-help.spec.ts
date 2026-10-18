import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import { account } from "../../fixtures/account";

test("opens password help on demand and restores keyboard focus", async ({
    page,
}) => {
    const help = page.getByRole("button", {
        name: "Password requirements",
        exact: true,
    });
    const popup = page.getByRole("dialog", {
        name: "Password requirements",
        exact: true,
    });
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await expect(help).toHaveAttribute("aria-expanded", "false");
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(popup).toBeVisible();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(popup.getByRole("listitem")).toHaveCount(3);
    await expect(popup).toContainText("15\u2013128 characters");
    await expect(popup).toContainText(
        "Spaces and Unicode characters are supported",
    );
    await expect(popup).toContainText(
        "No mandatory uppercase, number, or symbol rules",
    );
    await expect(
        page.getByRole("button", { name: "Close password help", exact: true }),
    ).toBeFocused();
    // Browser-resolved colours cover color-mix backgrounds that axe cannot always evaluate.
    const guidanceContrast = await page
        .getByRole("dialog", { name: "Password requirements", exact: true })
        .evaluate((element) => {
            const item = element.querySelector("li");
            const context = document.createElement("canvas").getContext("2d");
            if (!item || !context)
                throw new Error("Password guidance is unavailable");
            const luminance = () => {
                const [r = 0, g = 0, b = 0] = Array.from(
                    context.getImageData(0, 0, 1, 1).data,
                )
                    .slice(0, 3)
                    .map((value) => value / 255)
                    .map((value) =>
                        value <= 0.04045
                            ? value / 12.92
                            : ((value + 0.055) / 1.055) ** 2.4,
                    );
                return r * 0.2126 + g * 0.7152 + b * 0.0722;
            };
            context.fillStyle = getComputedStyle(element).backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const background = luminance();
            context.fillStyle = getComputedStyle(item).color;
            context.fillRect(0, 0, 1, 1);
            const foreground = luminance();
            return (
                (Math.max(background, foreground) + 0.05) /
                (Math.min(background, foreground) + 0.05)
            );
        });
    expect(guidanceContrast).toBeGreaterThanOrEqual(4.5);
    await checkAccessibility(page);
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(help).toBeFocused();
    await help.click();
    await page.getByLabel("Email address", { exact: true }).click();
    await expect(popup).toBeHidden();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await help.click();
    await page
        .getByRole("button", { name: "Close password help", exact: true })
        .click();
    await expect(popup).toBeHidden();
    await expect(help).toBeFocused();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test.describe("password help on touch devices", () => {
    test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

    test("fits the viewport with larger text and respects reduced motion", async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
        });
        const help = page.getByRole("button", {
            name: "Password requirements",
            exact: true,
        });
        const popup = page.getByRole("dialog", {
            name: "Password requirements",
            exact: true,
        });
        await help.tap();
        await expect(popup).toBeVisible();
        const bounds = await popup.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds?.x).toBeGreaterThanOrEqual(16);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
            304,
        );
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            ),
        ).toBe(false);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        await checkAccessibility(page);
        await page
            .getByRole("button", { name: "Close password help", exact: true })
            .tap();
        await expect(popup).toBeHidden();
    });
});
