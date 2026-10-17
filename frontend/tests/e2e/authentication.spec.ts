import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { isRecord } from "../../app/lib/api";

test("registers, verifies through Mailpit, restores the session and signs in again", async ({
    page,
    request,
    baseURL,
}) => {
    const email = `authentication-${randomUUID()}@caseward.test`;
    const name = "Authentication smoke test";
    const password = "A long authentication smoke passphrase";

    await page.goto("/register");
    // Without browser fetch metadata, Laravel must enforce the token fallback.
    const csrf = await request.post("/api/register", {
        headers: { Origin: baseURL ?? "", Accept: "application/json" },
        data: {},
    });
    expect(csrf.status()).toBe(419);
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL("/verify-email");

    const protectedStatus = () =>
        page.evaluate(
            async () =>
                (
                    await fetch("/api/user", {
                        headers: { Accept: "application/json" },
                    })
                ).status,
        );
    expect(await protectedStatus()).toBe(403);
    let messageId: string | undefined;
    await expect
        .poll(
            async () => {
                const response = await request.get(
                    "http://mailpit:8025/api/v1/search",
                    { params: { query: `to:${email}` } },
                );
                expect(response.ok()).toBe(true);
                const body: unknown = await response.json();
                if (!isRecord(body) || !Array.isArray(body.messages))
                    throw new Error("Invalid Mailpit search response");
                const message: unknown = body.messages[0];
                if (message === undefined) return false;
                if (!isRecord(message) || typeof message.ID !== "string")
                    throw new Error("Invalid Mailpit message ID");
                messageId = message.ID;
                return true;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    if (!messageId) throw new Error("Verification email was not captured");
    const response = await request.get(
        `http://mailpit:8025/api/v1/message/${messageId}`,
    );
    expect(response.ok()).toBe(true);
    const message: unknown = await response.json();
    if (
        !isRecord(message) ||
        typeof message.HTML !== "string" ||
        typeof message.Text !== "string"
    )
        throw new Error("Invalid Mailpit email content");
    expect(message.Subject).toBe("Verify your email | Caseward");
    const link = await page.evaluate(
        (html) =>
            new DOMParser()
                .parseFromString(html, "text/html")
                .querySelector("a")
                ?.getAttribute("href"),
        message.HTML,
    );
    if (!link) throw new Error("Verification email has no action link");
    const target = new URL(link);
    expect(target.origin).toBe(baseURL);
    expect(target.pathname).toMatch(/^\/email\/verify\/\d+\/[a-f0-9]{40}$/);
    expect(message.Text).toContain(link);
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Confirm your email", exact: true }),
    ).toBeVisible();
    expect(await protectedStatus()).toBe(403);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continue to your account" }).click();
    await expect(page).toHaveURL("/account");
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/account");
    await expect(page).toHaveURL("/login?reason=session");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/account");
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    expect(await page.pageErrors()).toEqual([]);
});
