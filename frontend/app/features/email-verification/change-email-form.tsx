import { useEffect, useRef } from "react";
import { useFetcher, useNavigate } from "react-router";
import { FormField } from "~/components/forms/form-field";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { Button, ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { CardHeading } from "~/components/layout/card-page";
import type { UserResource as User } from "~/generated/api/operations.schemas";
import { emailFields, type ChangeEmailResult } from "./change-email";

export function ChangeEmailForm({ user }: { user: User }) {
    const fetcher = useFetcher<ChangeEmailResult>();
    const navigate = useNavigate();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result,
        pending,
        emailFields,
    );

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <>
            <CardHeading
                ref={headingRef}
                title="Change email address"
                description="Let’s get your verification email to the right inbox."
            />
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
                Current address:
                <strong className="block font-semibold wrap-anywhere text-foreground">
                    {user.email}
                </strong>
                We’ll send a new verification link to the address you save. Your
                account will stay unverified until you confirm it.
            </p>
            {!pending && result?.status === "validation" && (
                <Notice tone="danger" role="alert" className="mb-5">
                    <p>Please check the email address below.</p>
                </Notice>
            )}
            {!pending && result?.status === "error" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    tone="danger"
                    role="alert"
                    className="mb-5"
                    title="We couldn’t confirm your email address was updated."
                >
                    <p>
                        {result.reason === "expired"
                            ? "Your security token expired. Please try again."
                            : "Your request may have reached us. Check your connection and the saved address before trying again."}
                    </p>
                    <ButtonLink
                        to="/verify-email"
                        variant="ghost"
                        className="mt-2 px-2 py-1 underline"
                    >
                        Check saved email address
                    </ButtonLink>
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
                    if (disabled) event.preventDefault();
                }}
            >
                <input type="hidden" name="account_id" value={user.id} />
                <fieldset disabled={disabled} className="min-w-0 space-y-5">
                    <FormField
                        {...emailFields[0]}
                        defaultValue={user.email}
                        errors={errors.email}
                    />
                    <SubmitButton
                        pending={pending}
                        label="Save and send verification email"
                        pendingLabel="Saving email…"
                    />
                </fieldset>
            </fetcher.Form>
            <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                disabled={pending}
                onClick={() => {
                    void navigate("/verify-email");
                }}
            >
                Cancel
            </Button>
            <p className="sr-only" role="status">
                {pending
                    ? "Saving your email address and sending a verification link. Please wait."
                    : ""}
            </p>
        </>
    );
}
