import { CardHeading, CardPage } from "~/components/layout/card-page";
import { SessionError } from "~/features/authentication/session-error";
import { CreateWorkspaceForm } from "~/features/workspaces/create-workspace-form";
import { WorkspaceFooter } from "~/features/workspaces/workspace-footer";
import { WorkspaceLoadError } from "~/features/workspaces/workspace-load-error";
import {
    createWorkspace,
    createWorkspaceLoader,
} from "~/features/workspaces/workspaces";
import type { Route } from "./+types/create-workspace";

export const clientLoader = createWorkspaceLoader;
export const clientAction = createWorkspace;
export { shouldRevalidateForm as shouldRevalidate } from "~/components/forms/revalidation";
export function meta() {
    return [{ title: "Create a workspace | Caseward" }];
}
export default function CreateWorkspace({ loaderData }: Route.ComponentProps) {
    return (
        <CardPage>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : loaderData.workspaces.status === "error" ? (
                <>
                    <CardHeading
                        title="Create a workspace"
                        description="Your shared space for support and customer operations."
                    />
                    <WorkspaceLoadError title="We couldn’t load your workspaces." />
                    <WorkspaceFooter user={loaderData.user} />
                </>
            ) : (
                <CreateWorkspaceForm
                    key={loaderData.user.id}
                    user={loaderData.user}
                    hasWorkspaces={loaderData.workspaces.page.total > 0}
                />
            )}
        </CardPage>
    );
}
