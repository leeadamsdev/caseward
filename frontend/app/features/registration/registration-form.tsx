import { useFetcher } from "react-router";
import { FormField } from "~/components/forms/form-field";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import {
    SubmitButton,
    RateLimitNotice,
} from "~/components/forms/form-feedback";
import { AuthNavigation } from "~/features/authentication/auth-navigation";
import { CardHeading } from "~/components/layout/card-page";
import { Notice } from "~/components/ui/notice";
import { registrationFields, type RegistrationResult } from "./registration";
import { PasswordHelp } from "~/components/forms/password-help";

export function RegistrationForm() {
    const fetcher = useFetcher<RegistrationResult>();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result,
        pending,
        registrationFields,
    );

    return (
        <>
            <CardHeading
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
                        {result.reason === "expired"
                            ? "Your security token expired. Submit the form again to refresh it."
                            : result.reason === "network"
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
                aria-labelledby="page-title"
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
