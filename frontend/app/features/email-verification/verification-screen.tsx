import { Clock3, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher, useNavigation, useRevalidator } from "react-router";
import { SuccessMark } from "~/components/feedback/success-mark";
import { ButtonLink } from "~/components/ui/button";
import { CardHeading } from "~/components/layout/card-page";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import type { VerificationResult } from "~/features/email-verification/verification";
import type { UserResource as User } from "~/generated/api/operations.schemas";
import { ResendVerificationForm } from "./resend-verification-form";
import { VerificationForm } from "./verification-form";
import type { ResendResult } from "./verification";
import { withReturnTo } from "~/features/authentication/return-to";

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
    continuation,
}: {
    user: User;
    path: string;
    accountId: string;
    continuation?: string | undefined;
}) {
    const fetcher = useFetcher<VerificationResult>();
    const resend = useFetcher<ResendResult>();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const result = fetcher.data;
    const headingRef = useRef<HTMLHeadingElement>(null);
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
        <div key={status} className="card-result">
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
            <CardHeading
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
                <ButtonLink
                    to={continuation ?? "/workspaces"}
                    className="mt-7 w-full"
                >
                    {continuation
                        ? "Continue to invitation"
                        : "Continue to workspaces"}
                </ButtonLink>
            ) : status === "confirm" ? (
                <VerificationForm fetcher={fetcher} path={path} />
            ) : (
                <>
                    {status === "invalid" && !user.email_verified && (
                        <ResendVerificationForm
                            fetcher={resend}
                            returnTo={path}
                            variant="primary"
                            disabled={
                                navigation.state !== "idle" ||
                                revalidator.state !== "idle"
                            }
                        />
                    )}
                    {status === "account-mismatch" && (
                        <SignOutForm
                            label="Sign in with another account"
                            returnTo={path}
                            variant="primary"
                        />
                    )}
                    <ButtonLink
                        to={
                            user.email_verified
                                ? (continuation ?? "/workspaces")
                                : withReturnTo("/verify-email", continuation)
                        }
                        variant={
                            status === "account-mismatch" ||
                            (status === "invalid" && !user.email_verified)
                                ? "outline"
                                : "primary"
                        }
                        className="mt-5 w-full"
                    >
                        {user.email_verified
                            ? continuation
                                ? "Back to invitation"
                                : "Back to workspaces"
                            : "Back to verification"}
                    </ButtonLink>
                    {status !== "account-mismatch" && (
                        <SignOutForm disabled={resend.state !== "idle"} />
                    )}
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
