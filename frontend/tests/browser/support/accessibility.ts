import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function checkAccessibility(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        const animations = document.getAnimations().filter((animation) => {
            const iterations = animation.effect?.getTiming().iterations;
            return iterations !== undefined && Number.isFinite(iterations);
        });
        await Promise.allSettled(
            animations.map((animation) => animation.finished),
        );
    });
    const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
    expect(result.violations).toEqual([]);
}
