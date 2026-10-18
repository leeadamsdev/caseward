import { CardPage } from "~/components/layout/card-page";
import { signOut } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import { WorkspaceFooter } from "~/features/workspaces/workspace-footer";
import { WorkspaceList } from "~/features/workspaces/workspace-list";
import { workspacesLoader } from "~/features/workspaces/workspaces";
import type { Route } from "./+types/workspaces";

export const clientLoader = workspacesLoader;
export const clientAction = signOut;
export { shouldRevalidateForm as shouldRevalidate } from "~/components/forms/revalidation";
export function meta() {
    return [{ title: "Choose a workspace | Caseward" }];
}
export default function Workspaces({ loaderData }: Route.ComponentProps) {
    return (
        <CardPage className="max-w-140">
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <>
                    <WorkspaceList result={loaderData.workspaces} />
                    <WorkspaceFooter user={loaderData.user} />
                </>
            )}
        </CardPage>
    );
}
