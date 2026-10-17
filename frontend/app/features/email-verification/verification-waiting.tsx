import { Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRevalidator, useSearchParams, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { AuthHeading } from "~/features/authentication/auth-shell";
import type { User } from "~/features/authentication/session";
import { SignOutForm } from "~/features/authentication/sign-out-form";

export function VerificationWaiting({ user }: { user: User }) {
    const revalidator = useRevalidator();
    const navigation = useNavigation();
    const [params] = useSearchParams();
    const [checked, setChecked] = useState(false);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const pending = revalidator.state !== "idle";
    const deliveryFailed = params.get("delivery") === "failed";

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, []);
    useEffect(() => {
        if (checked && !pending) noticeRef.current?.focus();
    }, [checked, pending]);

    return (
        <>
            <div
                className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-accent text-primary"
                aria-hidden="true"
            >
                <Mail className="size-8" strokeWidth={1.7} />
            </div>
            <AuthHeading
                ref={headingRef}
                title={
                    deliveryFailed ? "Verify your email" : "Check your email"
                }
                description="You’re one step away."
            />
            <p className="text-center text-sm leading-6 text-muted-foreground">
                {deliveryFailed
                    ? "Verify the email address for your account:"
                    : "Check your inbox for a verification link:"}
                <strong className="mt-1 block font-semibold wrap-anywhere text-foreground">
                    {user.email}
                </strong>
            </p>
            {deliveryFailed ? (
                <Notice
                    tone="warning"
                    title="Your account is saved"
                    className="mt-6"
                >
                    <p>
                        We couldn’t send your verification email. Please try
                        again later.
                    </p>
                </Notice>
            ) : (
                <Notice className="mt-6">
                    <p className="leading-6">
                        Follow the link to verify your address before
                        continuing. The link expires in 1 hour. If you don’t see
                        the email, check your spam folder.
                    </p>
                </Notice>
            )}
            {checked && !pending && (
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
            <Button
                className="mt-6 w-full"
                disabled={pending || navigation.state !== "idle"}
                onClick={() => {
                    setChecked(true);
                    void revalidator.revalidate();
                }}
            >
                {pending ? "Checking verification…" : "I’ve verified my email"}
            </Button>
            <p className="sr-only" role="status">
                {pending ? "Checking your email verification status." : ""}
            </p>
            <SignOutForm disabled={pending} />
        </>
    );
}
