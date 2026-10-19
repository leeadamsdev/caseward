import { useEffect, useRef, useState, type RefObject } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import type { Invitation, PageResult } from "./members";
import type { InvitationResult } from "./invitations";
import { InvitationFeedback } from "./invitation-feedback";
import { RevokeInvitation } from "./revoke-invitation";
import { PageNavigation } from "./page-navigation";
import { WorkspaceLoadError } from "./workspace-load-error";

function InvitationRow({
    invitation,
    accountId,
    now,
    finalFocus,
}: {
    invitation: Invitation;
    accountId: number;
    now: number;
    finalFocus: RefObject<HTMLElement | null>;
}) {
    const fetcher = useFetcher<InvitationResult>();
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    // This mirrors the documented resend interval for UX; the server enforces it.
    const queuedAt = invitation.last_queued_at
        ? Date.parse(invitation.last_queued_at) + 60_000
        : 0;
    const retryAt =
        result?.status === "rate-limited"
            ? result.retryAt
            : result?.status === "queued"
              ? result.retry.retryAt
              : 0;
    const remaining = Math.max(
        0,
        Math.ceil((Math.max(queuedAt, retryAt) - now) / 1000),
    );
    const expired = Date.parse(invitation.expires_at) <= now;
    return (
        <li className="min-w-0 space-y-3 py-5 first:pt-0">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                    <p className="text-sm font-medium wrap-anywhere">
                        {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {expired
                            ? "Expired"
                            : `Expires ${new Date(invitation.expires_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
                    </p>
                    {!invitation.last_queued_at && (
                        <p className="mt-1 text-xs text-warning">
                            Email not queued. Use Resend to try again.
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                        className={`rounded-full px-2.5 py-1 text-xs ${expired ? "bg-warning-surface text-warning" : "bg-accent text-accent-foreground"}`}
                    >
                        {expired ? "Expired" : "Pending"}
                    </span>
                    <fetcher.Form
                        method="post"
                        aria-busy={pending}
                        onSubmit={(event) => {
                            if (pending || remaining > 0)
                                event.preventDefault();
                        }}
                    >
                        <input type="hidden" name="intent" value="resend" />
                        <input
                            type="hidden"
                            name="account_id"
                            value={accountId}
                        />
                        <input
                            type="hidden"
                            name="invitation_id"
                            value={invitation.id}
                        />
                        <Button
                            type="submit"
                            variant="outline"
                            disabled={pending || remaining > 0}
                            aria-label={`Resend invitation to ${invitation.email}`}
                            className="min-h-11 px-3 py-2"
                        >
                            {pending
                                ? "Queuing…"
                                : remaining > 0
                                  ? `Resend in ${String(remaining)}s`
                                  : "Resend"}
                        </Button>
                    </fetcher.Form>
                    <RevokeInvitation
                        invitation={invitation}
                        accountId={accountId}
                        finalFocus={finalFocus}
                        disabled={pending}
                    />
                </div>
            </div>
            <InvitationFeedback
                result={result}
                pending={pending}
                remaining={remaining}
            />
        </li>
    );
}

export function InvitationList({
    result,
    accountId,
}: {
    result: PageResult<Invitation>;
    accountId: number;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => {
            clearInterval(timer);
        };
    }, []);
    return (
        <section
            aria-labelledby="invitations-heading"
            className="rounded-xl border bg-card p-4 sm:p-6"
        >
            <h2
                ref={heading}
                id="invitations-heading"
                tabIndex={-1}
                className="font-semibold"
            >
                Invitations
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">
                People join only after accepting their invitation.
            </p>
            {result.status === "error" ? (
                <WorkspaceLoadError title="We couldn’t load the invitations" />
            ) : (
                <>
                    {result.page.data.length === 0 ? (
                        <p className="rounded-lg bg-muted p-5 text-sm text-muted-foreground">
                            No outstanding invitations. Invite a colleague to
                            get started.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {result.page.data.map((invitation) => (
                                <InvitationRow
                                    key={invitation.id}
                                    invitation={invitation}
                                    accountId={accountId}
                                    now={now}
                                    finalFocus={heading}
                                />
                            ))}
                        </ul>
                    )}
                    <PageNavigation
                        page={result.page}
                        parameter="invitationsPage"
                        label="Invitation pages"
                    />
                </>
            )}
        </section>
    );
}
