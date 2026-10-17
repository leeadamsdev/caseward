import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { SubmitButton } from "~/components/forms/form-feedback";
import { Notice } from "~/components/ui/notice";
import { AuthHeading, AuthShell } from "~/features/authentication/auth-shell";
import { accountLoader, signOut } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import type { ApiFailure } from "~/lib/api";
import type { Route } from "./+types/account";

export const clientLoader = accountLoader;
export const clientAction = signOut;
export function meta() {
    return [{ title: "Your account | Caseward" }];
}

export default function Account({ loaderData }: Route.ComponentProps) {
    const fetcher = useFetcher<ApiFailure>();
    const noticeRef = useRef<HTMLDivElement>(null);
    const pending = fetcher.state !== "idle";
    useEffect(() => {
        if (!pending && fetcher.data) noticeRef.current?.focus();
    }, [pending, fetcher.data]);

    return (
        <AuthShell>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <>
                    <AuthHeading
                        title="You’re signed in"
                        description="Welcome to Caseward."
                    />
                    <dl className="space-y-4 rounded-xl bg-accent p-4 text-sm">
                        <div>
                            <dt className="text-muted-foreground">Full name</dt>
                            <dd className="mt-1 font-medium wrap-anywhere">
                                {loaderData.user.name}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                Email address
                            </dt>
                            <dd className="mt-1 font-medium wrap-anywhere">
                                {loaderData.user.email}
                            </dd>
                        </div>
                    </dl>
                    {!pending && fetcher.data && (
                        <Notice
                            ref={noticeRef}
                            tabIndex={-1}
                            tone="danger"
                            role="alert"
                            className="mt-5"
                            title="We couldn’t confirm you were signed out."
                        >
                            <p>Check your connection and try again.</p>
                        </Notice>
                    )}
                    <fetcher.Form
                        method="post"
                        aria-label="Sign out"
                        aria-busy={pending}
                        className="mt-6"
                        onSubmit={(event) => {
                            if (pending) event.preventDefault();
                        }}
                    >
                        <fieldset disabled={pending}>
                            <SubmitButton
                                pending={pending}
                                label="Sign out"
                                pendingLabel="Signing out…"
                            />
                        </fieldset>
                    </fetcher.Form>
                    <p className="sr-only" role="status">
                        {pending ? "Signing you out. Please wait." : ""}
                    </p>
                </>
            )}
        </AuthShell>
    );
}
