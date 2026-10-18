import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";

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
