import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { FormField } from "~/components/forms/form-field";
import { SubmitButton } from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type {
    UserResource,
    WorkspaceResource,
} from "~/generated/api/operations.schemas";
import { invitationFields, type InvitationResult } from "./invitations";
import { InvitationFeedback } from "./invitation-feedback";

export function InviteColleague({
    workspace,
    user,
}: {
    workspace: WorkspaceResource;
    user: UserResource;
}) {
    const [open, setOpen] = useState(false);
    const fetcher = useFetcher<InvitationResult>();
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const { formRef, remaining, errors, disabled } = useFormFeedback(
        result?.status === "error" ||
            result?.status === "validation" ||
            result?.status === "rate-limited"
            ? result
            : undefined,
        pending,
        invitationFields,
    );
    const finished =
        result?.status === "queued" || result?.status === "queue-failed";
    return (
        <Modal
            open={open}
            onOpenChange={(next) => {
                if (next) fetcher.reset();
                setOpen(next);
            }}
            busy={pending}
            title="Invite a colleague"
            description={`Invite someone to ${workspace.name}.`}
            trigger={
                <Button className="w-full sm:w-auto">
                    <Plus className="size-5" aria-hidden="true" />
                    Invite colleague
                </Button>
            }
        >
            <div className="mb-5">
                <InvitationFeedback
                    result={result}
                    pending={pending}
                    remaining={remaining}
                />
            </div>
            {finished ? (
                <Button
                    className="w-full"
                    onClick={() => {
                        setOpen(false);
                    }}
                >
                    {result.status === "queue-failed"
                        ? "View invitations"
                        : "Done"}
                </Button>
            ) : (
                <fetcher.Form
                    ref={formRef}
                    method="post"
                    noValidate
                    aria-label="Invite a colleague"
                    aria-busy={pending}
                    onSubmit={(event) => {
                        if (disabled) event.preventDefault();
                    }}
                >
                    <input type="hidden" name="intent" value="invite" />
                    <input type="hidden" name="account_id" value={user.id} />
                    <fieldset disabled={disabled} className="min-w-0 space-y-5">
                        <FormField
                            {...invitationFields[0]}
                            errors={errors.email}
                        />
                        <div className="flex gap-3 rounded-xl bg-accent p-4 text-sm">
                            <ShieldCheck
                                className="size-5 shrink-0 text-primary"
                                aria-hidden="true"
                            />
                            <div>
                                <p className="font-medium">
                                    They’ll join as a Member.
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                    Invitations expire after 7 days.
                                </p>
                            </div>
                        </div>
                        <SubmitButton
                            pending={pending}
                            label="Send invitation"
                            pendingLabel="Queuing invitation…"
                        />
                    </fieldset>
                    <Button
                        variant="outline"
                        disabled={pending}
                        className="mt-3 w-full"
                        onClick={() => {
                            setOpen(false);
                        }}
                    >
                        Cancel
                    </Button>
                </fetcher.Form>
            )}
        </Modal>
    );
}
