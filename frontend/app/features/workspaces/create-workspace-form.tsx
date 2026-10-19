import { ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher, useNavigation, useSearchParams } from "react-router";
import { CardHeading } from "~/components/layout/card-page";
import { FormField } from "~/components/forms/form-field";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import type { UserResource as User } from "~/generated/api/models";
import { WorkspaceFooter } from "./workspace-footer";
import { workspaceFields, type CreateWorkspaceResult } from "./workspaces";

export function CreateWorkspaceForm({
    user,
    hasWorkspaces,
}: {
    user: User;
    hasWorkspaces: boolean;
}) {
    const fetcher = useFetcher<CreateWorkspaceResult>();
    const navigation = useNavigation();
    const [params] = useSearchParams();
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const headingRef = useRef<HTMLHeadingElement>(null);
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result,
        pending,
        workspaceFields,
    );
    useEffect(() => {
        headingRef.current?.focus();
    }, []);
    return (
        <>
            <CardHeading
                ref={headingRef}
                title="Create a workspace"
                description="Your shared space for support and customer operations."
            />
            {!result && params.get("account") === "changed" && (
                <Notice
                    tone="warning"
                    className="mb-5"
                    title="Your signed-in account changed"
                >
                    <p>
                        No workspace was created. Check the account below before
                        continuing.
                    </p>
                </Notice>
            )}
            {!pending && result?.status === "error" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    tone="danger"
                    role="alert"
                    className="mb-5"
                    title={
                        result.reason === "expired"
                            ? "Please try creating your workspace again."
                            : "We couldn’t confirm creation."
                    }
                >
                    <p>
                        {result.reason === "expired"
                            ? "Your security token expired. Submit the form again to refresh it."
                            : "Your request may have reached us. Check your workspaces before creating another."}
                    </p>
                    {result.reason !== "expired" && (
                        <ButtonLink
                            to="/workspaces"
                            variant="ghost"
                            className="mt-2 min-h-11 px-2 py-2 underline"
                        >
                            Check workspaces
                        </ButtonLink>
                    )}
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <RateLimitNotice ref={noticeRef} remaining={remaining} />
            )}
            <fetcher.Form
                ref={formRef}
                method="post"
                noValidate
                aria-labelledby="page-title"
                aria-busy={pending}
                onSubmit={(event) => {
                    if (disabled || navigation.state !== "idle")
                        event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="create" />
                <input type="hidden" name="account_id" value={user.id} />
                <fieldset
                    disabled={disabled || navigation.state !== "idle"}
                    className="min-w-0 space-y-5"
                >
                    <FormField
                        {...workspaceFields[0]}
                        errors={errors.name}
                        hint="Use your business or team name."
                    />
                    <div className="flex items-start gap-3 rounded-xl bg-accent p-4 text-sm text-foreground">
                        <ShieldCheck
                            className="mt-0.5 size-5 shrink-0 text-primary"
                            aria-hidden="true"
                        />
                        <p>You’ll be the workspace owner.</p>
                    </div>
                    <SubmitButton
                        pending={pending}
                        label="Create workspace"
                        pendingLabel="Creating workspace…"
                    />
                </fieldset>
            </fetcher.Form>
            {hasWorkspaces && (
                <ButtonLink
                    to="/workspaces"
                    variant="ghost"
                    className="mt-3 min-h-11 w-full py-2 underline underline-offset-4"
                >
                    Back to workspaces
                </ButtonLink>
            )}
            <p role="status" className="sr-only">
                {pending ? "Creating your workspace. Please wait." : ""}
            </p>
            <WorkspaceFooter user={user} disabled={pending} />
        </>
    );
}
