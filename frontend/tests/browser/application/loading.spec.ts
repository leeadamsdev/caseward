import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";

test("renders accessible loading before JavaScript has downloaded", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    let resume = () => {};
    const download = new Promise<void>((resolve) => {
        resume = resolve;
    });
    await page.route("**/assets/entry.client-*.js", async (route) => {
        await download;
        await route.continue();
    });
    let initialWaveStart: number | undefined;

    try {
        await page.goto("/register", { waitUntil: "commit" });
        await expect(page.getByRole("status")).toContainText(
            "Loading Caseward…",
        );
        await expect(page.getByRole("img", { name: "Caseward" })).toHaveCount(
            0,
        );
        await expect(page.locator(".page-spinner")).toBeVisible();
        await checkAccessibility(page);
        initialWaveStart = await page
            .locator(".brand-wave-top")
            .evaluate((element) => {
                const animation = element.getAnimations()[0];
                if (!animation || typeof animation.startTime !== "number") {
                    throw new Error("The wave animation has not started.");
                }
                return animation.startTime;
            });
    } finally {
        resume();
    }

    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Loading Caseward…", { exact: true }),
    ).toHaveCount(0);
    expect(
        await page
            .locator(".brand-wave-top")
            .evaluate((element) => element.getAnimations()[0]?.startTime),
    ).toBe(initialWaveStart);
});

test("explains a longer session check and finishes loading when it completes", async ({
    page,
}) => {
    await page.clock.install();
    let resume = () => {};
    const session = new Promise<void>((resolve) => {
        resume = resolve;
    });
    await page.route("**/api/session", async (route) => {
        await session;
        await route.fulfill({
            status: 401,
            json: { message: "Unauthenticated." },
        });
    });

    try {
        await page.goto("/register");
        await expect(page.getByRole("status")).toContainText(
            "Loading Caseward…",
        );
        await page.clock.runFor(8_100);
        await expect(page.getByRole("status")).toContainText(
            "This is taking longer than usual.",
        );
    } finally {
        resume();
    }

    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Loading Caseward…", { exact: true }),
    ).toHaveCount(0);
});

test("keeps the loading heading stable while the font downloads", async ({
    page,
}) => {
    let resumeFont = () => {};
    let resumeSession = () => {};
    const font = new Promise<void>((resolve) => {
        resumeFont = resolve;
    });
    const session = new Promise<void>((resolve) => {
        resumeSession = resolve;
    });
    await page.route(/inter-latin-wght-normal.*\.woff2/, async (route) => {
        await font;
        await route.continue();
    });
    await page.route("**/api/session", async (route) => {
        await session;
        await route.fulfill({
            status: 401,
            json: { message: "Unauthenticated." },
        });
    });
    const heading = page.getByRole("heading", { name: "Loading Caseward…" });
    const measure = () =>
        heading.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return {
                textWidth: range.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height,
                top: element.getBoundingClientRect().top,
                loaded: document.fonts.check('600 24px "Inter Variable"'),
            };
        });

    try {
        await page.goto("/register", { waitUntil: "domcontentloaded" });
        await expect(heading).toBeVisible();
        const before = await measure();
        expect(before.loaded).toBe(false);
        resumeFont();
        await page.evaluate(() => document.fonts.ready);
        const after = await measure();
        expect(after.loaded).toBe(true);
        expect(Math.abs(after.textWidth - before.textWidth)).toBeLessThan(2);
        expect(after.height).toBe(before.height);
        expect(after.top).toBeCloseTo(before.top, 0);
    } finally {
        resumeFont();
        resumeSession();
    }
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});
