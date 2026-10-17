import type { Page } from "@playwright/test";
import type { User } from "../app/features/authentication/session";

export async function mockBrowserSession(page: Page) {
    // Never let an unexpected API call reach a real backend during browser tests.
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        if (
            new URL(request.url()).pathname === "/api/session" &&
            request.method() === "GET"
        ) {
            await route.fulfill({
                status: 401,
                json: { message: "Unauthenticated." },
            });
            return;
        }
        await route.abort("blockedbyclient");
        throw new Error(
            `Unexpected API request: ${request.method()} ${request.url()}`,
        );
    });
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({
            status: 204,
            headers: {
                "Set-Cookie": "XSRF-TOKEN=test%3Dtoken; Path=/; SameSite=Lax",
            },
        }),
    );
}

export async function mockSignedInSession(page: Page, user: User) {
    await page.route("**/api/session", (route) =>
        route.fulfill({ json: { data: user } }),
    );
}
