import { useFetcher, useSearchParams } from "react-router";
import { FormField } from "~/components/forms/form-field";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { verificationPath } from "~/features/email-verification/links";
import { AuthHeading, AuthNavigation } from "./auth-shell";
import { loginFields, type LoginResult } from "./login";

export function LoginForm() {
    const fetcher = useFetcher<LoginResult>();
    const [params] = useSearchParams();
    const returnTo = verificationPath(params.get("returnTo"));
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const { formRef, noticeRef, remaining, errors, disabled } = useFormFeedback(
        result,
        pending,
        loginFields,
    );

    return (
        <>
            <AuthHeading
                title="Sign in"
                description="Welcome back to Caseward."
            />
            <div className="sr-only" role="status">
                {pending ? "Signing you in. Please wait." : ""}
            </div>
            {!result && returnTo && (
                <Notice className="mb-5">
                    <p>
                        Sign in to the account this link was sent to. We’ll
                        bring you back to verify your email.
                    </p>
                </Notice>
            )}
            {!result && !returnTo && params.get("reason") === "session" && (
                <Notice className="mb-5">
                    <p>
                        Please sign in to continue. Your session may have
                        expired.
                    </p>
                </Notice>
            )}
            {!pending && result?.status === "validation" && (
                <Notice tone="danger" role="alert" className="mb-5">
                    <p>Please check your details and try again.</p>
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
                            ? "Please try signing in again."
                            : "We couldn’t confirm you were signed in."
                    }
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
                <RateLimitNotice ref={noticeRef} remaining={remaining} />
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
                    <legend className="sr-only">Sign-in details</legend>
                    {loginFields.map((field) => (
                        <FormField
                            key={field.name}
                            {...field}
                            errors={errors[field.name]}
                        />
                    ))}
                    <div className="text-right">
                        <ButtonLink
                            to="/forgot-password"
                            variant="ghost"
                            className="px-1 py-2 text-sm underline underline-offset-4"
                        >
                            Forgot password?
                        </ButtonLink>
                    </div>
                    <SubmitButton
                        pending={pending}
                        label="Sign in"
                        pendingLabel="Signing in…"
                    />
                </fieldset>
            </fetcher.Form>
            <AuthNavigation
                prompt="New to Caseward?"
                to="/register"
                label="Create an account"
            />
        </>
    );
}
