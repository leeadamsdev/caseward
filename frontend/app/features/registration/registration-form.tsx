import { useFetcher } from "react-router";
import { ButtonLink } from "~/components/ui/button";
import { FormField } from "~/components/forms/form-field";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import {
    SubmitButton,
    RateLimitNotice,
} from "~/components/forms/form-feedback";
import {
    AuthHeading,
    AuthNavigation,
} from "~/features/authentication/auth-shell";
import { Notice } from "~/components/ui/notice";
import { registrationFields, type RegistrationResult } from "./registration";
import { SuccessMark } from "./success-mark";
import { PasswordHelp } from "./password-help";

export function RegistrationForm() {
    const fetcher = useFetcher<RegistrationResult>();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result,
        pending,
        registrationFields,
    );

    if (result?.status === "created") {
        return (
            <div
                ref={noticeRef}
                tabIndex={-1}
                className="auth-result rounded-lg text-center outline-none"
                aria-labelledby="auth-title"
            >
                <SuccessMark />
                <h1
                    id="auth-title"
                    className="text-2xl font-semibold tracking-tight"
                >
                    Account created
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Your Caseward account has been created
                    <span className="block">
                        for{" "}
                        <strong className="font-semibold wrap-anywhere text-foreground">
                            {result.email}
                        </strong>
                        .
                    </span>
                </p>
                <Notice title="You’re all set!" className="mt-7 text-left">
                    <p className="leading-6 text-accent-foreground/80">
                        Your account has been created, but you’re not signed in
                        yet and no workspace has been created.
                    </p>
                </Notice>
                <ButtonLink to="/login" className="mt-6 w-full">
                    Continue to sign in
                </ButtonLink>
            </div>
        );
    }

    return (
        <>
            <AuthHeading
                title="Create account"
                description="Get started with Caseward."
            />
            <div className="sr-only" role="status">
                {pending ? "Creating your account. Please wait." : ""}
            </div>
            {!pending && result?.status === "validation" && (
                <Notice tone="danger" role="alert" className="mb-5">
                    <p>Please fix the errors below to create your account.</p>
                </Notice>
            )}
            {!pending && result?.status === "error" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    tone="danger"
                    role="alert"
                    title="We couldn’t confirm your account was created."
                    className="mb-5"
                >
                    <p className="leading-5">
                        {result.reason === "network"
                            ? "Check your connection and try again. Your previous request may still have reached us."
                            : "Please try again in a moment. Your details have been kept."}
                    </p>
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <RateLimitNotice remaining={remaining} ref={noticeRef} />
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
                <fieldset disabled={disabled} className="min-w-0 space-y-5">
                    <legend className="sr-only">Account details</legend>
                    {registrationFields.map((field) => (
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
                                field.name === "password_confirmation"
                                    ? "password confirmation"
                                    : undefined
                            }
                        />
                    ))}
                    <SubmitButton
                        pending={pending}
                        label="Create account"
                        pendingLabel="Creating account…"
                    />
                </fieldset>
            </fetcher.Form>
            <AuthNavigation
                prompt="Already have an account?"
                to="/login"
                label="Sign in"
            />
        </>
    );
}
