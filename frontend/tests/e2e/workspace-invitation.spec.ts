import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { fillRegistration } from "../support/forms";
import { capturedMail, mailActionLink } from "./support/mailpit";

test("invites a new colleague, verifies in another tab, accepts explicitly and limits member access", async ({
    page,
    browser,
    request,
    baseURL,
}) => {
    if (!baseURL) throw new Error("A base URL is required");
    const suffix = randomUUID();
    const ownerEmail = `owner-${suffix}@caseward.test`;
    const colleagueEmail = `colleague-${suffix}@caseward.test`;
    const password = "A long invitation test passphrase";
    const workspaceName = "Invitation review workspace";
    await page.goto("/register");
    await fillRegistration(page, {
        name: "Workspace owner",
        email: ownerEmail,
        password,
        password_confirmation: password,
    });
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
    const ownerMail = await capturedMail(request, `to:${ownerEmail}`);
    await page.goto(await mailActionLink(page, ownerMail.html));
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await page.getByRole("link", { name: "Continue to workspaces" }).click();
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspaceName);
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(page).toHaveURL(/\/w\/[0-7][0-9a-hjkmnp-tv-z]{25}$/);
    const workspaceUrl = page.url();
    await page.getByRole("link", { name: "View members" }).click();
    await expect(page).toHaveURL(`${workspaceUrl}/members`);
    const membersUrl = page.url();
    await page.getByRole("button", { name: "Invite colleague" }).click();
    await page
        .getByRole("textbox", { name: "Email address" })
        .fill(colleagueEmail);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const inviteMail = await capturedMail(
        request,
        `to:${colleagueEmail} subject:"Workspace invitation"`,
    );
    const invitationLink = await mailActionLink(page, inviteMail.html);
    expect(new URL(invitationLink).origin).toBe(baseURL);
    await page.goto(invitationLink);
    await expect(
        page.getByRole("heading", { name: "Use your invited account" }),
    ).toBeVisible();
    await expect(page.getByText(workspaceName, { exact: true })).toHaveCount(0);
    await page.goto(membersUrl);

    const colleagueContext = await browser.newContext({ baseURL });
    try {
        const colleague = await colleagueContext.newPage();
        await colleague.goto(invitationLink);
        await expect(
            colleague.getByRole("heading", { name: "You’ve been invited" }),
        ).toBeVisible();
        await colleague
            .getByRole("link", { name: "Create an account", exact: true })
            .click();
        await fillRegistration(colleague, {
            name: "Invited colleague",
            email: colleagueEmail,
            password,
            password_confirmation: password,
        });
        await colleague
            .getByRole("button", { name: "Create account", exact: true })
            .click();
        await expect(colleague).toHaveURL(/\/verify-email\?returnTo=/);
        const verification = await capturedMail(
            request,
            `to:${colleagueEmail} subject:"Verify your email"`,
        );
        const confirmTab = await colleagueContext.newPage();
        await confirmTab.goto(
            await mailActionLink(colleague, verification.html),
        );
        await confirmTab
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
        await confirmTab
            .getByRole("link", { name: "Continue to invitation" })
            .click();
        await expect(
            confirmTab.getByRole("heading", { name: `Join ${workspaceName}` }),
        ).toBeVisible();
        const noMembership = await colleagueContext.request.get(
            `${baseURL}/api${new URL(workspaceUrl).pathname.replace("/w/", "/workspaces/")}`,
            { headers: { Accept: "application/json", Origin: baseURL } },
        );
        expect(noMembership.status()).toBe(404);
        await confirmTab
            .getByRole("button", { name: "Accept invitation" })
            .click();
        await expect(
            confirmTab.getByRole("heading", { name: "You’re in!" }),
        ).toBeVisible();
        await expect(
            confirmTab.getByText(`You’ve joined ${workspaceName} as a Member.`),
        ).toBeVisible();
        await confirmTab.getByRole("link", { name: "Open workspace" }).click();
        await expect(confirmTab).toHaveURL(workspaceUrl);
        await confirmTab.getByRole("link", { name: "View members" }).click();
        await expect(
            confirmTab.getByRole("heading", { name: "Workspace members" }),
        ).toBeVisible();
        await expect(
            confirmTab.getByRole("button", { name: "Invite colleague" }),
        ).toHaveCount(0);
        await expect(
            confirmTab.getByRole("heading", {
                name: "Invitations",
                exact: true,
            }),
        ).toHaveCount(0);
        await confirmTab.goto(invitationLink);
        await expect(
            confirmTab.getByRole("heading", { name: "Already joined" }),
        ).toBeVisible();
        await expect(
            confirmTab.getByRole("button", { name: "Accept invitation" }),
        ).toHaveCount(0);
        await colleague
            .getByRole("button", { name: "I’ve verified my email" })
            .click();
        await expect(colleague).toHaveURL(invitationLink);
        await expect(
            colleague.getByRole("heading", { name: "Already joined" }),
        ).toBeVisible();
        await page.reload();
        await expect(
            page.getByText("Invited colleague", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(/No outstanding invitations/),
        ).toBeVisible();
        expect(await colleague.pageErrors()).toEqual([]);
        expect(await confirmTab.pageErrors()).toEqual([]);
    } finally {
        await colleagueContext.close();
    }
    expect(await page.pageErrors()).toEqual([]);
});
