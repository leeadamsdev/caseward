import {
    useNavigation,
    useRevalidator,
    type FetcherWithComponents,
} from "react-router";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useFormFeedback } from "~/components/forms/use-form-feedback";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import type { VerificationResult } from "./verification";

const noFields = [] as const;

export function VerificationForm({
    fetcher,
    path,
}: {
    fetcher: FetcherWithComponents<VerificationResult>;
    path: string;
}) {
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const revalidating = revalidator.state !== "idle";
    const failure =
        result?.status === "error" || result?.status === "rate-limited"
            ? result
            : undefined;
    const { noticeRef, remaining, disabled } = useFormFeedback(
        failure,
        pending,
        noFields,
    );
    const blocked = disabled || navigation.state !== "idle" || revalidating;

    return (
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
                        disabled={revalidating || navigation.state !== "idle"}
                        onClick={() => {
                            void revalidator.revalidate();
                        }}
                        className="mt-2 px-2 py-1 text-destructive underline"
                    >
                        {revalidating
                            ? "Checking verification…"
                            : "Check verification status"}
                    </Button>
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <RateLimitNotice ref={noticeRef} remaining={remaining} />
            )}
            <fetcher.Form
                method="post"
                aria-label="Verify email"
                aria-busy={pending}
                onSubmit={(event) => {
                    if (blocked) event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="verify" />
                <fieldset disabled={blocked}>
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
                disabled={pending || revalidating}
            />
        </div>
    );
}
