import { ArrowLeft, Unlink } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { SuccessMark } from "~/components/feedback/success-mark";
import { FormField } from "~/components/forms/form-field";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { PasswordHelp } from "~/components/forms/password-help";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { CardHeading } from "~/components/layout/card-page";
import {
    resetFields,
    type ResetLink,
    type ResetResult,
} from "./reset-password";

export function ResetPasswordForm({ link }: { link: ResetLink | undefined }) {
    const fetcher = useFetcher<ResetResult>();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const status =
        !link || result?.status === "invalid"
            ? "invalid"
            : result?.status === "reset"
              ? "reset"
              : "form";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const failure =
        result?.status === "invalid" || result?.status === "reset"
            ? undefined
            : result;
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        failure,
        pending,
        resetFields,
    );

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, [status]);

    return (
        <>
            {status === "reset" ? (
                <div className="card-result">
                    <SuccessMark celebrate={false} />
                    <CardHeading
                        ref={headingRef}
                        title="Password reset"
                        description="Your password has been updated."
                    />
                    <Notice className="mb-6">
                        <p className="leading-6">
                            You’ve been signed out on other devices. Sign in
                            with your new password to continue.
                        </p>
                    </Notice>
                </div>
            ) : status === "invalid" ? (
                <div className="card-result">
                    <div
                        className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-warning-surface text-warning"
                        aria-hidden="true"
                    >
                        <Unlink className="size-8" strokeWidth={1.7} />
                    </div>
                    <CardHeading
                        ref={headingRef}
                        title="This link is no longer valid"
                        description="It may have expired or already been used."
                    />
                    <p className="mb-6 text-center text-sm leading-6 text-muted-foreground">
                        Request a new link to reset your password.
                    </p>
                    <ButtonLink
                        to="/forgot-password"
                        replace
                        className="w-full"
                    >
                        Request a new link
                    </ButtonLink>
                </div>
            ) : (
                <>
                    <CardHeading
                        ref={headingRef}
                        title="Reset your password"
                        description="Choose a new password for your account."
                    />
                    <p className="mb-6 text-center text-sm wrap-anywhere text-muted-foreground">
                        {link?.email}
                    </p>
                    {!pending && result?.status === "validation" && (
                        <Notice tone="danger" role="alert" className="mb-5">
                            <p>Please fix the errors below.</p>
                        </Notice>
                    )}
                    {!pending && result?.status === "error" && (
                        <Notice
                            ref={noticeRef}
                            tabIndex={-1}
                            tone="danger"
                            role="alert"
                            className="mb-5"
                            title="We couldn’t confirm the reset"
                        >
                            <p className="leading-5">
                                {result.reason === "expired"
                                    ? "Your security token expired. Submit the form again to refresh it."
                                    : "Your request may have reached us. Try signing in with your new password before requesting another link."}
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
                        aria-labelledby="page-title"
                        aria-busy={pending}
                        onSubmit={(event) => {
                            if (disabled) event.preventDefault();
                        }}
                    >
                        <fieldset
                            disabled={disabled}
                            className="min-w-0 space-y-5"
                        >
                            {resetFields.map((field) => (
                                <FormField
                                    key={field.name}
                                    {...field}
                                    errors={errors[field.name]}
                                    labelAction={
                                        field.name === "password" ? (
                                            <PasswordHelp />
                                        ) : undefined
                                    }
                                    visibilityLabel={
                                        field.name === "password"
                                            ? "new password"
                                            : "password confirmation"
                                    }
                                />
                            ))}
                            <SubmitButton
                                pending={pending}
                                label="Reset password"
                                pendingLabel="Resetting password…"
                            />
                        </fieldset>
                    </fetcher.Form>
                    <p className="sr-only" role="status">
                        {pending ? "Resetting your password. Please wait." : ""}
                    </p>
                </>
            )}
            <ButtonLink
                to="/login"
                replace
                variant={status === "reset" ? "primary" : "outline"}
                className="mt-3 w-full"
            >
                {status !== "reset" && (
                    <ArrowLeft className="size-4" aria-hidden="true" />
                )}
                Back to sign in
            </ButtonLink>
        </>
    );
}
