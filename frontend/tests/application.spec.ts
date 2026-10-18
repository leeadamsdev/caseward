import { expect, test } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession } from "./browser-session";

test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
});

test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("starts and opens registration from the home page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/register");
    await expect(page).toHaveTitle("Create account | Caseward");
    await expect(
        page
            .getByRole("main")
            .getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Loading Caseward…", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).toHaveCSS(
        "font-family",
        /Inter Variable/,
    );
});

test("handles unknown deep links and returns home using the keyboard", async ({
    page,
}) => {
    await page.goto("/unknown/nested/page");

    await expect(
        page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Page not found | Caseward");
    await expect(page.getByRole("img", { name: "Caseward" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();

    await page.reload();

    await expect(
        page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
        page.getByRole("link", { name: "Return to home" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL("/register");
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});

test("renders accessible loading before JavaScript has downloaded", async ({
    page,
}) => {
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

test("keeps loading and missing-page motion accessible on small screens", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 640 });
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
        await expect(page.locator(".page-spinner")).toHaveCSS(
            "animation-name",
            "none",
        );
        await expect(page.locator(".brand-wave-top")).toHaveCSS(
            "animation-name",
            "none",
        );
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(320);
    } finally {
        resume();
    }

    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await page.goto("/missing");
    await expect(
        page.getByRole("heading", { name: "Page not found" }),
    ).toBeFocused();
    await expect(page.locator(".brand-wave-top")).toHaveCSS(
        "animation-name",
        "none",
    );
    await expect(page.getByRole("link", { name: "Return to home" })).toHaveCSS(
        "cursor",
        "pointer",
    );
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await checkAccessibility(page);
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

test("animates the shared waves on loading and missing pages at different widths", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
    const checkWaves = async () => {
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 });
            const waves = page.locator(".brand-wave");
            await expect(waves).toHaveCount(2);
            const initial = await waves
                .first()
                .evaluate((element) => getComputedStyle(element).transform);
            expect(initial).not.toBe("none");
            await expect
                .poll(() =>
                    waves
                        .first()
                        .evaluate(
                            (element) => getComputedStyle(element).transform,
                        ),
                )
                .not.toBe(initial);
        }
    };

    try {
        await page.goto("/register");
        await expect(
            page.getByRole("heading", { name: "Loading Caseward…" }),
        ).toBeVisible();
        await checkWaves();
    } finally {
        resume();
    }
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await page.goto("/missing");
    await checkWaves();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("keeps the same wave animations when loading hands over to the page", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
    let initialStart: number | undefined;
    const wave = page.locator(".brand-wave-top");
    try {
        await page.goto("/register");
        await expect(
            page.getByRole("heading", { name: "Loading Caseward…" }),
        ).toBeVisible();
        initialStart = await wave.evaluate((element) => {
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
    expect(
        await wave.evaluate((element) => element.getAnimations()[0]?.startTime),
    ).toBe(initialStart);
    const card = page.locator(".card-page");
    let previousArrival = await card.evaluate(
        (element) => element.getAnimations()[0]?.startTime,
    );
    for (const [link, heading] of [
        ["Sign in", "Sign in"],
        ["Create an account", "Create account"],
    ] as const) {
        await page.getByRole("link", { name: link, exact: true }).click();
        await expect(
            page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await expect
            .poll(() =>
                card.evaluate((element) => {
                    const animation = element.getAnimations()[0];
                    return typeof animation?.startTime === "number"
                        ? animation.startTime
                        : -1;
                }),
            )
            .toBeGreaterThan(Number(previousArrival));
        previousArrival = await card.evaluate(
            (element) => element.getAnimations()[0]?.startTime,
        );
        expect(
            await wave.evaluate(
                (element) => element.getAnimations()[0]?.startTime,
            ),
        ).toBe(initialStart);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await expect(card).toHaveCSS("animation-name", "none");
});

test("the missing-page back button safely returns home after a direct visit", async ({
    page,
}) => {
    await page.route("https://external.example/", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><html lang='en'><title>External site</title><body>External site</body></html>",
        }),
    );
    await page.goto("https://external.example/");
    await page.goto("/missing");
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page).toHaveURL("/register");
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});
