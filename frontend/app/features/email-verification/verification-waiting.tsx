import { Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    useRevalidator,
    useSearchParams,
    useNavigation,
    useFetcher,
    useNavigate,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { CardHeading } from "~/components/layout/card-page";
import type { UserResource as User } from "~/generated/api/operations.schemas";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import { ResendVerificationForm } from "./resend-verification-form";
import type { ResendResult } from "./verification";

export function VerificationWaiting({ user }: { user: User }) {
    const navigate = useNavigate();
    const revalidator = useRevalidator();
    const navigation = useNavigation();
    const resend = useFetcher<ResendResult>();
    const resending = resend.state !== "idle";
    const [params, setParams] = useSearchParams();
    const [checked, setChecked] = useState(false);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const pending = revalidator.state !== "idle";
    const updated = params.get("updated") === "1";
    const queueFailed =
        params.get("queue") === "failed" && resend.data?.status !== "queued";

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, []);
    useEffect(() => {
        if (checked && !pending) noticeRef.current?.focus();
    }, [checked, pending]);
    useEffect(() => {
        if (
            resend.data?.status !== "queued" ||
            (!params.has("queue") && !params.has("account"))
        )
            return;
        const next = new URLSearchParams(params);
        next.delete("queue");
        next.delete("account");
        setParams(next, { replace: true, preventScrollReset: true });
    }, [resend.data, params, setParams]);

    return (
        <>
            <div
                className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-accent text-primary"
                aria-hidden="true"
            >
                <Mail className="size-8" strokeWidth={1.7} />
            </div>
            <CardHeading
                ref={headingRef}
                title={queueFailed ? "Verify your email" : "Check your email"}
                description="You’re one step away."
            />
            <p className="text-center text-sm leading-6 text-muted-foreground">
                {queueFailed
                    ? "Verify the email address for your account:"
                    : "Check your inbox for a verification link:"}
                <strong className="mt-1 block font-semibold wrap-anywhere text-foreground">
                    {user.email}
                </strong>
            </p>
            {!resend.data && params.get("account") === "changed" && (
                <Notice
                    tone="warning"
                    className="mt-6"
                    title="Your signed-in account changed"
                >
                    <p>
                        The previous form didn’t change an email address. Check
                        the account above before continuing.
                    </p>
                </Notice>
            )}
            {!resend.data &&
                params.get("account") !== "changed" &&
                (queueFailed ? (
                    <Notice
                        tone="warning"
                        title={
                            updated
                                ? "Email address saved"
                                : "Your account is saved"
                        }
                        className="mt-6"
                    >
                        <p>
                            {updated
                                ? "Your email address was updated, but we couldn’t queue the verification email. Please try resending it below."
                                : "We couldn’t queue your verification email. Please try resending it below."}
                        </p>
                    </Notice>
                ) : (
                    <Notice
                        className="mt-6"
                        title={updated ? "Email address saved" : ""}
                    >
                        <p className="leading-6">
                            Delivery can take a moment. Follow the link to
                            verify your address before continuing. The link
                            expires in 1 hour. If you don’t see the email, check
                            your spam folder.
                        </p>
                    </Notice>
                ))}
            {checked && !pending && !resending && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    role="status"
                    className="mt-5"
                >
                    <p>
                        Your email isn’t verified yet. Open the link in your
                        email, then check again.
                    </p>
                </Notice>
            )}
            <ResendVerificationForm
                fetcher={resend}
                disabled={pending || navigation.state !== "idle"}
                variant={queueFailed ? "primary" : "outline"}
            >
                <Button
                    className="w-full"
                    variant={queueFailed ? "outline" : "primary"}
                    disabled={
                        pending || resending || navigation.state !== "idle"
                    }
                    onClick={() => {
                        setChecked(true);
                        void revalidator.revalidate();
                    }}
                >
                    {pending
                        ? "Checking verification…"
                        : "I’ve verified my email"}
                </Button>
                <p className="sr-only" role="status">
                    {pending ? "Checking your email verification status." : ""}
                </p>
            </ResendVerificationForm>
            <Button
                variant="ghost"
                className="mt-4 min-h-12 w-full px-4 py-3"
                disabled={pending || resending || navigation.state !== "idle"}
                onClick={() => {
                    void navigate("/verify-email/change");
                }}
            >
                Change email address
            </Button>
            <SignOutForm disabled={pending || resending} />
        </>
    );
}
