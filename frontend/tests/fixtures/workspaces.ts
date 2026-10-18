import type { Workspace } from "~/features/workspaces/workspaces";

export const workspaceId = (number: number) =>
    `01${"0".repeat(22)}${number.toString().padStart(2, "0")}`;

export const workspace = {
    id: workspaceId(1),
    name: "Acme Support",
    role: "owner",
} satisfies Workspace;

export function workspacePage(items: Workspace[], page = 1) {
    return {
        data: items.slice((page - 1) * 25, page * 25),
        meta: {
            current_page: page,
            last_page: Math.max(1, Math.ceil(items.length / 25)),
            total: items.length,
        },
    };
}
