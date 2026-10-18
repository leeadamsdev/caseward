import type { Page } from "@playwright/test";

type Credentials = { email: string; password: string };

export async function fillLogin(page: Page, values: Credentials) {
    await page.getByLabel("Email address", { exact: true }).fill(values.email);
    await page.getByLabel("Password", { exact: true }).fill(values.password);
}

export async function signIn(page: Page, values: Credentials) {
    await fillLogin(page, values);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function fillRegistration(
    page: Page,
    values: Credentials & { name: string; password_confirmation: string },
) {
    await page.getByLabel("Full name", { exact: true }).fill(values.name);
    await page.getByLabel("Email address", { exact: true }).fill(values.email);
    await page.getByLabel("Password", { exact: true }).fill(values.password);
    await page
        .getByLabel("Confirm password", { exact: true })
        .fill(values.password_confirmation);
}

export async function fillResetPasswords(page: Page, password: string) {
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page
        .getByLabel("Confirm new password", { exact: true })
        .fill(password);
}
