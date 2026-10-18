import { CardHeading, CardPage } from "~/components/layout/card-page";
import { useEffect, useRef } from "react";
import { ButtonLink } from "~/components/ui/button";
import { signOut } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import { WorkspaceFooter } from "~/features/workspaces/workspace-footer";
import { WorkspaceLoadError } from "~/features/workspaces/workspace-load-error";
import { workspaceLoader } from "~/features/workspaces/workspaces";
import type { Route } from "./+types/workspace";

export const clientLoader = workspaceLoader;
export const clientAction = signOut;
export { shouldRevalidateForm as shouldRevalidate } from "~/components/forms/revalidation";
// A redirect can render metadata before this route has loader data.
export function meta({
    loaderData,
}: {
    loaderData?: Route.MetaArgs["loaderData"];
}) {
    return [
        {
            title: `${loaderData?.status === "authenticated" && loaderData.result.status === "loaded" ? loaderData.result.workspace.name : "Workspace"} | Caseward`,
        },
    ];
}
export default function Workspace({ loaderData }: Route.ComponentProps) {
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        headingRef.current?.focus();
    }, [loaderData]);
    return (
        <CardPage>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <>
                    {loaderData.result.status === "loaded" ? (
                        <>
                            <CardHeading
                                ref={headingRef}
                                title={loaderData.result.workspace.name}
                                description="Your workspace is ready."
                            />
                            <dl className="rounded-xl bg-accent p-4 text-sm">
                                <dt className="text-muted-foreground">
                                    Your role
                                </dt>
                                <dd className="mt-1 font-semibold">
                                    {loaderData.result.workspace.role ===
                                    "owner"
                                        ? "Owner"
                                        : "Member"}
                                </dd>
                            </dl>
                        </>
                    ) : loaderData.result.status === "missing" ? (
                        <CardHeading
                            ref={headingRef}
                            title="Workspace unavailable"
                            description="This workspace may have been removed, or you may no longer have access."
                        />
                    ) : (
                        <>
                            <CardHeading
                                ref={headingRef}
                                title="Your workspace"
                                description="We couldn’t load this workspace."
                            />
                            <WorkspaceLoadError title="Connection problem" />
                        </>
                    )}
                    <ButtonLink
                        to="/workspaces"
                        variant="outline"
                        className="mt-6 w-full"
                    >
                        Choose a workspace
                    </ButtonLink>
                    <WorkspaceFooter user={loaderData.user} />
                </>
            )}
        </CardPage>
    );
}
