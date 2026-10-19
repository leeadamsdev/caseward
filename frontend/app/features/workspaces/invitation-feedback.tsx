import { useEffect, useRef } from "react";
import { RateLimitNotice } from "~/components/forms/form-feedback";
import { Notice } from "~/components/ui/notice";
import type { InvitationResult } from "./invitations";

export function InvitationFeedback({
    result,
    pending,
    remaining,
}: {
    result: InvitationResult | undefined;
    pending: boolean;
    remaining: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!pending && result?.status !== "validation") ref.current?.focus();
    }, [pending, result]);
    if (
        pending ||
        !result ||
        result.status === "validation" ||
        result.status === "revoked"
    )
        return null;
    if (result.status === "rate-limited")
        return <RateLimitNotice ref={ref} remaining={remaining} />;
    if (result.status === "queued")
        return (
            <Notice
                ref={ref}
                tabIndex={-1}
                role="status"
                title="Invitation queued"
            >
                <p className="wrap-anywhere">
                    We’ll email {result.invitation.email} with a link to join.
                </p>
            </Notice>
        );
    if (result.status === "queue-failed")
        return (
            <Notice
                ref={ref}
                tabIndex={-1}
                role="alert"
                tone="danger"
                title="We couldn’t queue the email"
            >
                <p>
                    The invitation is saved. Use Resend in the invitations list
                    to try sending it again.
                </p>
            </Notice>
        );
    if (result.status === "unavailable")
        return (
            <Notice
                ref={ref}
                tabIndex={-1}
                role="alert"
                tone="warning"
                title="Invitation unavailable"
            >
                <p>
                    This invitation may already have been accepted or removed.
                    Check the refreshed list.
                </p>
            </Notice>
        );
    return (
        <Notice
            ref={ref}
            tabIndex={-1}
            role="alert"
            tone="danger"
            title={
                result.reason === "expired"
                    ? "Please try again"
                    : "We couldn’t confirm the change"
            }
        >
            <p>
                {result.reason === "expired"
                    ? "Your security token expired. Submit again to refresh it."
                    : "Your request may have reached us. Refresh the list before trying again."}
            </p>
        </Notice>
    );
}
