import type { WorkspaceResource as Workspace } from "~/generated/api/operations.schemas";
import type { ListWorkspaces200Response } from "~/generated/api/operations";

export const workspaceId = (number: number) =>
    `01${"0".repeat(22)}${number.toString().padStart(2, "0")}`;

export const workspace = {
    id: workspaceId(1),
    name: "Acme Support",
    role: "owner",
} satisfies Workspace;

export function workspacePage(items: Workspace[], page = 1) {
    const data = items.slice((page - 1) * 25, page * 25);
    const lastPage = Math.max(1, Math.ceil(items.length / 25));
    const path = "http://localhost/api/workspaces";
    const pageUrl = (number: number) => `${path}?page=${String(number)}`;
    return {
        data,
        links: {
            first: pageUrl(1),
            last: pageUrl(lastPage),
            prev: page > 1 ? pageUrl(page - 1) : null,
            next: page < lastPage ? pageUrl(page + 1) : null,
        },
        meta: {
            current_page: page,
            from: data.length ? (page - 1) * 25 + 1 : null,
            last_page: lastPage,
            links: [],
            path,
            per_page: 25,
            to: data.length ? (page - 1) * 25 + data.length : null,
            total: items.length,
        },
    } satisfies ListWorkspaces200Response;
}
