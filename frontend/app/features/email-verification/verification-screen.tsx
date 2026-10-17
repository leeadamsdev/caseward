import { Clock3, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher, useNavigation, useRevalidator } from "react-router";
import { SuccessMark } from "~/components/feedback/success-mark";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { ButtonLink, Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { AuthHeading } from "~/features/authentication/auth-shell";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import type { VerificationResult } from "~/features/email-verification/verification";
import type { User } from "~/features/authentication/session";

const noFields = [] as const;
const recoveryScreens = {
    invalid: {
        title: "Link expired or invalid",
        message:
            "This link is invalid or has expired. Check your inbox for a newer verification email for",
        icon: Clock3,
    },
    "account-mismatch": {
        title: "Different account signed in",
        message:
            "This link belongs to a different account. You’re currently signed in as",
        icon: UserRound,
    },
    "email-mismatch": {
        title: "Your email address changed",
        message:
            "This link no longer matches your address. Check your current inbox:",
        icon: Mail,
    },
};

export function VerificationScreen({
    user,
    path,
    accountId,
}: {
    user: User;
    path: string;
    accountId: string;
}) {
    const fetcher = useFetcher<VerificationResult>();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const failure =
        result?.status === "error" || result?.status === "rate-limited"
            ? result
            : undefined;
    const { noticeRef, remaining, disabled } = useFormFeedback(
        failure,
        pending,
        noFields,
    );
    const status = verificationState(user, result, accountId);

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, [status]);

    const recovery =
        status === "confirm" || status === "verified"
            ? undefined
            : recoveryScreens[status];
    const verifiedTitle =
        result?.status === "verified"
            ? "Email verified"
            : "Email already verified";
    const title =
        status === "verified"
            ? verifiedTitle
            : (recovery?.title ?? "Confirm your email");
    const Icon = recovery?.icon ?? ShieldCheck;

    return (
        <div key={status} className="auth-result">
            {status === "verified" ? (
                <SuccessMark celebrate={result?.status === "verified"} />
            ) : (
                <div
                    className={`mx-auto mt-7 flex size-18 items-center justify-center rounded-full ${status === "invalid" || status === "account-mismatch" ? "bg-warning-surface text-warning" : "bg-accent text-primary"}`}
                    aria-hidden="true"
                >
                    <Icon className="size-8" strokeWidth={1.7} />
                </div>
            )}
            <AuthHeading
                ref={headingRef}
                title={title}
                description={
                    status === "verified"
                        ? "Your account is ready to use."
                        : status === "confirm"
                          ? "You’re one step away."
                          : "Let’s get you back on track."
                }
            />
            <p className="text-center text-sm leading-6 text-muted-foreground">
                {status === "verified"
                    ? "You’ve verified"
                    : (recovery?.message ??
                      "Verify the email address for your account:")}
                <strong className="mt-1 block font-semibold wrap-anywhere text-foreground">
                    {user.email}
                </strong>
            </p>
            {status === "verified" ? (
                <ButtonLink to="/account" className="mt-7 w-full">
                    Continue to your account
                </ButtonLink>
            ) : status === "confirm" ? (
                <div className="mt-7">
                    {!pending && result?.status === "error" && (
                        <Notice
                            ref={noticeRef}
                            tabIndex={-1}
                            tone="danger"
                            role="alert"
                            className="mb-5"
                            title="We couldn’t verify your email."
                        >
                            <p>
                                {result.reason === "expired"
                                    ? "Your security token expired. Please try again."
                                    : "Check your connection and try again. Your request may have reached us."}
                            </p>
                            <Button
                                variant="ghost"
                                disabled={
                                    revalidator.state !== "idle" ||
                                    navigation.state !== "idle"
                                }
                                onClick={() => {
                                    void revalidator.revalidate();
                                }}
                                className="mt-2 px-2 py-1 text-destructive underline"
                            >
                                {revalidator.state !== "idle"
                                    ? "Checking verification…"
                                    : "Check verification status"}
                            </Button>
                        </Notice>
                    )}
                    {!pending && result?.status === "rate-limited" && (
                        <RateLimitNotice
                            ref={noticeRef}
                            remaining={remaining}
                        />
                    )}
                    <fetcher.Form
                        method="post"
                        aria-label="Verify email"
                        aria-busy={pending}
                        onSubmit={(event) => {
                            if (
                                disabled ||
                                navigation.state !== "idle" ||
                                revalidator.state !== "idle"
                            )
                                event.preventDefault();
                        }}
                    >
                        <input type="hidden" name="intent" value="verify" />
                        <fieldset
                            disabled={
                                disabled ||
                                navigation.state !== "idle" ||
                                revalidator.state !== "idle"
                            }
                        >
                            <SubmitButton
                                pending={pending}
                                label="Verify email"
                                pendingLabel="Verifying email…"
                            />
                        </fieldset>
                    </fetcher.Form>
                    <p className="sr-only" role="status">
                        {pending ? "Verifying your email. Please wait." : ""}
                    </p>
                    <SignOutForm
                        label="Switch account"
                        returnTo={path}
                        disabled={pending || revalidator.state !== "idle"}
                    />
                </div>
            ) : (
                <>
                    {status === "account-mismatch" && (
                        <SignOutForm
                            label="Sign in with another account"
                            returnTo={path}
                            variant="primary"
                        />
                    )}
                    <ButtonLink
                        to={user.email_verified ? "/account" : "/verify-email"}
                        variant={
                            status === "account-mismatch"
                                ? "outline"
                                : "primary"
                        }
                        className="mt-5 w-full"
                    >
                        {user.email_verified
                            ? "Back to your account"
                            : "Back to verification"}
                    </ButtonLink>
                    {status !== "account-mismatch" && <SignOutForm />}
                </>
            )}
        </div>
    );
}

function verificationState(
    user: User,
    result: VerificationResult | undefined,
    accountId: string,
): "invalid" | "account-mismatch" | "verified" | "email-mismatch" | "confirm" {
    if (result?.status === "invalid") return "invalid";
    if (result?.status === "account-mismatch" || String(user.id) !== accountId)
        return "account-mismatch";
    if (user.email_verified || result?.status === "verified") return "verified";
    if (result?.status === "email-mismatch") return "email-mismatch";
    return "confirm";
}
