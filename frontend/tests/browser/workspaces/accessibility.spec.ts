import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockWorkspaces as list } from "../support/session";
import { workspace, workspaceId as id } from "../../fixtures/workspaces";

test("brings the destination heading into view when leaving a long workspace list", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await list(page, [
        ...Array.from({ length: 24 }, (_, index) => ({
            ...workspace,
            id: id(index + 2),
            name: `Support ${String(index + 2)}`,
        })),
        workspace,
    ]);
    await page.goto("/workspaces");
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await page
        .getByRole("link", { name: "Create a workspace", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Create a workspace", exact: true }),
    ).toBeInViewport();
    await page
        .getByRole("link", { name: "Back to workspaces", exact: true })
        .click();
    await page
        .getByRole("link", { name: `Open ${workspace.name}`, exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: workspace.name, exact: true }),
    ).toBeInViewport();
});

test("fits narrow viewports and enlarged text with reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await list(page, [
        {
            ...workspace,
            name: "Équipe de support et opérations clientèle 東京".repeat(2),
        },
    ]);
    for (const path of [
        "/workspaces",
        "/workspaces/new",
        `/w/${workspace.id}`,
    ]) {
        await page.goto(path);
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            ),
        ).toBe(false);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        await checkAccessibility(page);
    }
});
