import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useRevalidator, useSearchParams } from "react-router";
import { CardHeading, CardPage } from "~/components/layout/card-page";
import { Button, ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { SessionError } from "~/features/authentication/session-error";
import { InvitationList } from "~/features/workspaces/invitation-list";
import { InviteColleague } from "~/features/workspaces/invite-colleague";
import { invitationAction } from "~/features/workspaces/invitations";
import { MemberList } from "~/features/workspaces/member-list";
import { membersLoader } from "~/features/workspaces/members";
import { WorkspaceFooter } from "~/features/workspaces/workspace-footer";
import { WorkspaceLoadError } from "~/features/workspaces/workspace-load-error";
import { workspacePath } from "~/features/workspaces/workspaces";
import type { Route } from "./+types/workspace-members";

export const clientLoader = membersLoader;
export const clientAction = invitationAction;
export { shouldRevalidateForm as shouldRevalidate } from "~/components/forms/revalidation";

export function meta() {
    return [{ title: "Members | Caseward" }];
}

export default function WorkspaceMembers({ loaderData }: Route.ComponentProps) {
    const heading = useRef<HTMLHeadingElement>(null);
    const { pathname, search } = useLocation();
    const [params] = useSearchParams();
    const revalidator = useRevalidator();
    useEffect(() => {
        heading.current?.focus();
    }, [pathname, search]);
    if (loaderData.status === "error")
        return (
            <CardPage>
                <SessionError />
            </CardPage>
        );
    if (loaderData.result.status !== "loaded" || !("members" in loaderData))
        return (
            <CardPage>
                <CardHeading
                    ref={heading}
                    title="Members unavailable"
                    description={
                        loaderData.result.status === "missing"
                            ? "This workspace may have been removed, or you may no longer have access."
                            : "We couldn’t load this workspace."
                    }
                />
                {loaderData.result.status === "error" && (
                    <WorkspaceLoadError title="Connection problem" />
                )}
                <ButtonLink
                    to="/workspaces"
                    className="mt-6 w-full"
                    variant="outline"
                >
                    All workspaces
                </ButtonLink>
                <WorkspaceFooter user={loaderData.user} />
            </CardPage>
        );
    const workspace = loaderData.result.workspace;
    return (
        <CardPage className="max-w-260">
            <div key={`${workspace.id}:${String(loaderData.user.id)}`}>
                <nav
                    aria-label="Workspace navigation"
                    className="mt-6 flex flex-wrap items-center justify-between gap-2"
                >
                    <ButtonLink
                        to={workspacePath(workspace)}
                        variant="ghost"
                        className="min-h-11 py-2"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Back to workspace
                    </ButtonLink>
                    <ButtonLink
                        to="/workspaces"
                        variant="ghost"
                        className="min-h-11 py-2"
                    >
                        All workspaces
                    </ButtonLink>
                </nav>
                <header className="my-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                    <div className="min-w-0">
                        <p className="mb-2 text-sm wrap-anywhere text-muted-foreground">
                            {workspace.name}
                        </p>
                        <h1
                            ref={heading}
                            tabIndex={-1}
                            id="page-title"
                            className="text-2xl font-semibold tracking-tight outline-none"
                        >
                            Members
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {workspace.role === "owner"
                                ? "Manage the people in your workspace."
                                : "The people in your workspace."}
                        </p>
                    </div>
                    {workspace.role === "owner" && (
                        <InviteColleague
                            workspace={workspace}
                            user={loaderData.user}
                        />
                    )}
                </header>
                {params.get("account") === "changed" && (
                    <Notice
                        tone="warning"
                        title="Your signed-in account changed"
                        className="mb-5"
                    >
                        <p>
                            Review the signed-in account below before making
                            further changes.
                        </p>
                    </Notice>
                )}
                <div className="space-y-6">
                    <MemberList
                        result={loaderData.members}
                        user={loaderData.user}
                    />
                    {loaderData.invitations && (
                        <InvitationList
                            result={loaderData.invitations}
                            accountId={loaderData.user.id}
                        />
                    )}
                </div>
                <Button
                    variant="ghost"
                    className="mt-4 min-h-11 gap-2 px-2 py-2"
                    disabled={revalidator.state !== "idle"}
                    onClick={() => {
                        void revalidator.revalidate();
                    }}
                >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {revalidator.state !== "idle"
                        ? "Refreshing…"
                        : "Refresh lists"}
                </Button>
                <WorkspaceFooter user={loaderData.user} />
            </div>
        </CardPage>
    );
}
