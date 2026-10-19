import { ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigation } from "react-router";
import { CardHeading } from "~/components/layout/card-page";
import { Button, ButtonLink } from "~/components/ui/button";
import {
    workspacePagePath,
    workspacePath,
    type WorkspaceListResult,
} from "./workspaces";
import { WorkspaceLoadError } from "./workspace-load-error";
import { cn } from "~/lib/utils";
import { initials } from "~/lib/initials";

export function WorkspaceList({ result }: { result: WorkspaceListResult }) {
    const navigation = useNavigation();
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        headingRef.current?.focus();
    }, [result]);
    return (
        <>
            <CardHeading
                ref={headingRef}
                title="Choose a workspace"
                description="Where would you like to work?"
            />
            {result.status === "error" ? (
                <WorkspaceLoadError title="We couldn’t load your workspaces." />
            ) : (
                <>
                    <ul className="space-y-3">
                        {result.page.items.map((workspace) => {
                            const opening =
                                navigation.state !== "idle" &&
                                navigation.location.pathname ===
                                    workspacePath(workspace);
                            return (
                                <li key={workspace.id}>
                                    <Link
                                        to={workspacePath(workspace)}
                                        aria-label={`Open ${workspace.name}`}
                                        aria-describedby={`workspace-role-${workspace.id}`}
                                        aria-busy={opening}
                                        className="group flex min-h-20 items-center gap-3 rounded-xl border border-border p-3 transition-[background-color,border-color,box-shadow] duration-200 hover:border-primary hover:bg-accent focus-visible:border-primary focus-visible:bg-accent motion-reduce:transition-none sm:px-4"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground"
                                        >
                                            {initials(workspace.name)}
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                            <span className="min-w-0 text-sm font-semibold wrap-anywhere">
                                                {workspace.name}
                                            </span>
                                            <span
                                                id={`workspace-role-${workspace.id}`}
                                                className={cn(
                                                    "shrink-0 rounded-full px-2.5 py-1 text-xs",
                                                    workspace.role === "owner"
                                                        ? "bg-accent text-accent-foreground"
                                                        : "bg-muted text-muted-foreground",
                                                )}
                                            >
                                                {workspace.role === "owner"
                                                    ? "Owner"
                                                    : "Member"}
                                            </span>
                                        </span>
                                        {opening ? (
                                            <LoaderCircle
                                                className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                                                aria-hidden="true"
                                            />
                                        ) : (
                                            <ChevronRight
                                                className="size-5 shrink-0 text-muted-foreground group-hover:text-primary"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    {result.page.lastPage > 1 && (
                        <nav
                            aria-label="Workspace pages"
                            className="mt-5 flex flex-wrap items-center justify-between gap-2"
                        >
                            {result.page.page > 1 ? (
                                <ButtonLink
                                    to={workspacePagePath(result.page.page - 1)}
                                    variant="outline"
                                    className="px-3"
                                >
                                    Previous
                                </ButtonLink>
                            ) : (
                                <Button
                                    disabled
                                    variant="outline"
                                    className="px-3"
                                >
                                    Previous
                                </Button>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Page {result.page.page} of{" "}
                                {result.page.lastPage}
                            </p>
                            {result.page.page < result.page.lastPage ? (
                                <ButtonLink
                                    to={workspacePagePath(result.page.page + 1)}
                                    variant="outline"
                                    className="px-3"
                                >
                                    Next
                                </ButtonLink>
                            ) : (
                                <Button
                                    disabled
                                    variant="outline"
                                    className="px-3"
                                >
                                    Next
                                </Button>
                            )}
                        </nav>
                    )}
                    <ButtonLink
                        to="/workspaces/new"
                        variant="outline"
                        className="mt-6 w-full"
                    >
                        <Plus className="size-5" aria-hidden="true" />
                        Create a workspace
                    </ButtonLink>
                </>
            )}
            <p role="status" className="sr-only">
                {navigation.state !== "idle" &&
                navigation.formData?.get("intent") !== "logout"
                    ? "Opening your workspace page. Please wait."
                    : ""}
            </p>
        </>
    );
}
