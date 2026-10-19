import type { UserResource } from "~/generated/api/operations.schemas";
import type { Member, PageResult } from "./members";
import { PageNavigation } from "./page-navigation";
import { WorkspaceLoadError } from "./workspace-load-error";
import { initials } from "~/lib/initials";

export function MemberList({
    result,
    user,
}: {
    result: PageResult<Member>;
    user: UserResource;
}) {
    return (
        <section
            aria-labelledby="members-heading"
            className="rounded-xl border bg-card p-4 sm:p-6"
        >
            <h2 id="members-heading" className="mb-5 font-semibold">
                Workspace members
            </h2>
            {result.status === "error" ? (
                <WorkspaceLoadError title="We couldn’t load the members" />
            ) : (
                <>
                    <ul className="divide-y">
                        {result.page.data.map((member) => (
                            <li
                                key={member.id}
                                className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
                            >
                                <span
                                    aria-hidden="true"
                                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                                >
                                    {initials(member.name)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold wrap-anywhere">
                                        {member.name}
                                        {member.id === user.id && (
                                            <span className="ml-2 font-normal text-muted-foreground">
                                                (You)
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-1 text-sm wrap-anywhere text-muted-foreground">
                                        {member.email}
                                    </p>
                                </div>
                                <span
                                    className={`rounded-full px-3 py-1 text-xs ${member.role === "owner" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}
                                >
                                    {member.role === "owner"
                                        ? "Owner"
                                        : "Member"}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {result.page.data.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            No members to display on this page.
                        </p>
                    )}
                    <PageNavigation
                        page={result.page}
                        parameter="membersPage"
                        label="Member pages"
                    />
                </>
            )}
        </section>
    );
}
