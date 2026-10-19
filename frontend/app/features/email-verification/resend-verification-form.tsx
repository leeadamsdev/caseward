import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { FetcherWithComponents } from "react-router";
import { RateLimitNotice } from "~/components/forms/form-feedback";
import { useRetryCountdown } from "~/components/forms/use-retry-countdown";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import type { ResendResult } from "./verification";

export function ResendVerificationForm({
    fetcher,
    disabled = false,
    variant = "outline",
    returnTo,
    children,
}: {
    fetcher: FetcherWithComponents<ResendResult>;
    disabled?: boolean;
    variant?: ComponentProps<typeof Button>["variant"];
    returnTo?: string;
    children?: ReactNode;
}) {
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const remaining = useRetryCountdown(
        result?.status === "rate-limited" ? result : result?.retry,
    );
    const noticeRef = useRef<HTMLDivElement>(null);
    const blocked = disabled || pending || remaining > 0;
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");

    useEffect(() => {
        if (!pending && result)
            noticeRef.current?.focus({ preventScroll: true });
    }, [pending, result]);

    return (
        <div className="mt-6">
            {!pending && result?.status === "queued" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    role="status"
                    title="Email queued"
                    className="mb-5"
                >
                    <p>
                        Your verification email is queued and should arrive
                        shortly. Check your inbox and spam folder.
                    </p>
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <RateLimitNotice ref={noticeRef} remaining={remaining} />
            )}
            {!pending && result?.status === "error" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    role="alert"
                    tone={result.reason === "queue" ? "warning" : "danger"}
                    title={
                        result.reason === "queue"
                            ? "Email couldn’t be queued"
                            : "We couldn’t confirm the email was queued."
                    }
                    className="mb-5"
                >
                    <p>
                        {result.reason === "expired"
                            ? "Your security token expired. Please try again."
                            : result.reason === "queue"
                              ? "Your account is saved. You can try again when the resend timer finishes."
                              : "Check your connection and inbox before trying again. Your request may have reached us."}
                    </p>
                </Notice>
            )}
            {children}
            <fetcher.Form
                method="post"
                action="/verify-email"
                aria-label="Resend verification email"
                aria-busy={pending}
                className={children ? "mt-3" : undefined}
                onSubmit={(event) => {
                    if (blocked) event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="resend" />
                {returnTo && (
                    <input type="hidden" name="returnTo" value={returnTo} />
                )}
                <Button
                    type="submit"
                    variant={variant}
                    disabled={blocked}
                    className="w-full"
                >
                    {pending && (
                        <LoaderCircle
                            className="size-5 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                    )}
                    <span>
                        {pending
                            ? "Requesting email…"
                            : remaining > 0
                              ? `Resend available in ${minutes.toString()}:${seconds}`
                              : "Resend verification email"}
                    </span>
                </Button>
            </fetcher.Form>
            <p className="sr-only" role="status">
                {pending
                    ? "Requesting your verification email. Please wait."
                    : result &&
                        result.status !== "rate-limited" &&
                        remaining === 0
                      ? "You can request another verification email now."
                      : ""}
            </p>
        </div>
    );
}
