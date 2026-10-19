import type {
    WorkspaceMemberResource,
    WorkspaceInvitationResource,
} from "~/generated/api/operations.schemas";
import { user } from "./account";
import { workspaceId } from "./workspaces";

export const member = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: "owner",
} satisfies WorkspaceMemberResource;
export const invitation: WorkspaceInvitationResource = {
    id: workspaceId(3),
    email: "colleague@caseward.test",
    expires_at: "2099-01-01T00:00:00+00:00",
    last_queued_at: null,
};

export function memberPage<T>(data: T[], page = 1, total = data.length) {
    const last = Math.max(1, Math.ceil(total / 25));
    return {
        data,
        links: { first: null, last: null, next: null, prev: null },
        meta: {
            current_page: page,
            last_page: last,
            per_page: 25,
            total,
            from: data.length ? (page - 1) * 25 + 1 : null,
            to: data.length ? (page - 1) * 25 + data.length : null,
            links: [],
            path: null,
        },
    };
}
