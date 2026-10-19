import { useRef, useState, type RefObject } from "react";
import { useFetcher } from "react-router";
import { useRetryCountdown } from "~/components/forms/use-retry-countdown";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type { Invitation } from "./members";
import type { InvitationResult } from "./invitations";
import { InvitationFeedback } from "./invitation-feedback";

export function RevokeInvitation({
    invitation,
    accountId,
    finalFocus,
    disabled,
}: {
    invitation: Invitation;
    accountId: number;
    finalFocus: RefObject<HTMLElement | null>;
    disabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const fetcher = useFetcher<InvitationResult>();
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const remaining = useRetryCountdown(
        result?.status === "rate-limited" ? result : undefined,
    );
    return (
        <Modal
            open={open}
            onOpenChange={(next) => {
                if (next) fetcher.reset();
                setOpen(next);
            }}
            busy={pending}
            finalFocus={() =>
                trigger.current?.isConnected
                    ? trigger.current
                    : finalFocus.current
            }
            title="Revoke invitation?"
            description={`${invitation.email} will no longer be able to join using this link.`}
            trigger={
                <Button
                    ref={trigger}
                    variant="ghost"
                    disabled={disabled}
                    className="min-h-11 px-3 py-2 text-destructive hover:not-disabled:text-destructive"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                >
                    Revoke
                </Button>
            }
        >
            <div className="mb-4">
                <InvitationFeedback
                    result={result}
                    pending={pending}
                    remaining={remaining}
                />
            </div>
            <fetcher.Form
                method="post"
                aria-busy={pending}
                onSubmit={(event) => {
                    if (pending || remaining > 0) event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="revoke" />
                <input type="hidden" name="account_id" value={accountId} />
                <input
                    type="hidden"
                    name="invitation_id"
                    value={invitation.id}
                />
                <Button
                    variant="outline"
                    className="mb-3 w-full"
                    disabled={pending}
                    onClick={() => {
                        setOpen(false);
                    }}
                >
                    Keep invitation
                </Button>
                <Button
                    type="submit"
                    disabled={pending || remaining > 0}
                    className="w-full bg-destructive bg-none text-destructive-foreground"
                >
                    {pending ? "Revoking…" : "Revoke invitation"}
                </Button>
            </fetcher.Form>
        </Modal>
    );
}
