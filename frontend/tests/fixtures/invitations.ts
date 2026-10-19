import type { GetWorkspaceInvitation200Response } from "~/generated/api/operations";
import { user } from "./account";
import { workspace } from "./workspaces";

const invitationToken = "c".repeat(64);
export const invitationPath = `/invitations/${invitationToken}`;
export const invitationPreview = {
    workspace: { id: workspace.id, name: workspace.name },
    email: user.email,
    expires_at: "2099-01-01T00:00:00+00:00",
    accepted: false,
} satisfies GetWorkspaceInvitation200Response["data"];
