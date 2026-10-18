import { ArrowLeft, Mail } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { FormField } from "~/components/forms/form-field";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { Button, ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { AuthHeading } from "~/features/authentication/auth-shell";
import { recoveryFields, type RecoveryRequestResult } from "./forgot-password";

export function ForgotPasswordForm() {
    const fetcher = useFetcher<RecoveryRequestResult>();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const accepted = result?.status === "accepted";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result?.status === "accepted" ? undefined : result,
        pending,
        recoveryFields,
    );

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, [accepted]);

    return (
        <>
            {accepted ? (
                <div className="auth-result">
                    <div
                        className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-accent text-primary"
                        aria-hidden="true"
                    >
                        <Mail className="size-8" strokeWidth={1.7} />
                    </div>
                    <AuthHeading
                        ref={headingRef}
                        title="Check your inbox"
                        description="Look for a password reset link."
                    />
                    <p className="text-center text-sm leading-6 text-muted-foreground">
                        If an account matches{" "}
                        <strong className="font-semibold wrap-anywhere text-foreground">
                            {result.email}
                        </strong>
                        , we’ll send a password reset link.
                    </p>
                    <Notice className="mt-6">
                        <p className="leading-6">
                            Check your spam folder too. Reset links expire after
                            30 minutes.
                        </p>
                    </Notice>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-6 w-full"
                        onClick={() => {
                            fetcher.reset();
                        }}
                    >
                        Try another email
                    </Button>
                </div>
            ) : (
                <>
                    <AuthHeading
                        ref={headingRef}
                        title="Forgot your password?"
                        description="We’ll help you get back into Caseward."
                    />
                    <p className="mb-6 text-sm leading-6 text-muted-foreground">
                        Enter your email address to request a reset link.
                    </p>
                    {!pending && result?.status === "validation" && (
                        <Notice tone="danger" role="alert" className="mb-5">
                            <p>Please check your email address.</p>
                        </Notice>
                    )}
                    {!pending && result?.status === "error" && (
                        <Notice
                            ref={noticeRef}
                            tabIndex={-1}
                            tone="danger"
                            role="alert"
                            className="mb-5"
                            title="We couldn’t confirm your request"
                        >
                            <p className="leading-5">
                                {result.reason === "expired"
                                    ? "Your security token expired. Submit the form again to refresh it."
                                    : result.reason === "network"
                                      ? "Check your connection and try again. Your request may still have reached us."
                                      : "Please try again in a moment. Your request may still have reached us."}
                            </p>
                        </Notice>
                    )}
                    {!pending && result?.status === "rate-limited" && (
                        <RateLimitNotice
                            ref={noticeRef}
                            remaining={remaining}
                        />
                    )}
                    <fetcher.Form
                        ref={formRef}
                        method="post"
                        noValidate
                        aria-labelledby="auth-title"
                        aria-busy={pending}
                        onSubmit={(event) => {
                            if (disabled) event.preventDefault();
                        }}
                    >
                        <fieldset
                            disabled={disabled}
                            className="min-w-0 space-y-5"
                        >
                            <FormField
                                {...recoveryFields[0]}
                                errors={errors.email}
                            />
                            <SubmitButton
                                pending={pending}
                                label="Send reset link"
                                pendingLabel="Requesting reset link…"
                            />
                        </fieldset>
                    </fetcher.Form>
                    <p className="sr-only" role="status">
                        {pending
                            ? "Requesting a password reset link. Please wait."
                            : ""}
                    </p>
                </>
            )}
            <ButtonLink
                to="/login"
                variant={accepted ? "ghost" : "outline"}
                className="mt-3 w-full px-4 py-3"
            >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to sign in
            </ButtonLink>
        </>
    );
}
