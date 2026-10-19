import { Link2Off, Mail, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import {
    useFetcher,
    useNavigation,
    useRevalidator,
    useSearchParams,
} from "react-router";
import { CardHeading } from "~/components/layout/card-page";
import { SuccessMark } from "~/components/feedback/success-mark";
import {
    RateLimitNotice,
    SubmitButton,
} from "~/components/forms/form-feedback";
import { useRetryCountdown } from "~/components/forms/use-retry-countdown";
import { Button, ButtonLink } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import { withReturnTo } from "~/features/authentication/return-to";
import { initials } from "~/lib/initials";
import { forgetInvitation } from "./continuation";
import type { InvitationData, AcceptResult } from "./invitation";

export function InvitationScreen({ data }: { data: InvitationData }) {
    const fetcher = useFetcher<AcceptResult>();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const [params] = useSearchParams();
    const pending = fetcher.state !== "idle";
    const result = fetcher.data;
    const retry =
        result?.status === "rate-limited"
            ? result
            : data.status === "rate-limited"
              ? data
              : undefined;
    const remaining = useRetryCountdown(retry);
    const heading = useRef<HTMLHeadingElement>(null);
    const notice = useRef<HTMLDivElement>(null);
    const unavailable =
        result?.status === "unavailable" || data.status === "unavailable";
    const accepted =
        result?.status === "accepted" ? result.workspace : undefined;
    const joined = Boolean(
        accepted || (data.status === "ready" && data.preview.accepted),
    );
    const state = unavailable ? "unavailable" : joined ? "joined" : data.status;
    const busy =
        pending || navigation.state !== "idle" || revalidator.state !== "idle";
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, [state]);
    useEffect(() => {
        if (
            !pending &&
            (result?.status === "error" || result?.status === "rate-limited")
        )
            notice.current?.focus();
    }, [pending, result]);

    const retryButton = (
        <Button
            className="mt-5 w-full"
            disabled={busy || remaining > 0}
            onClick={() => {
                void revalidator.revalidate();
            }}
        >
            {busy ? "Checking invitation…" : "Check invitation"}
        </Button>
    );
    if (unavailable)
        return (
            <>
                <div
                    className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-warning-surface text-warning"
                    aria-hidden="true"
                >
                    <Link2Off className="size-8" />
                </div>
                <CardHeading
                    ref={heading}
                    title="Invitation unavailable"
                    description="This link may have expired, been revoked or been replaced by a newer invitation."
                />
                <Notice>
                    <p>Ask a workspace owner for a new invitation.</p>
                </Notice>
                <ButtonLink to="/workspaces" className="mt-6 w-full">
                    All workspaces
                </ButtonLink>
            </>
        );
    if (data.status === "error" || data.status === "rate-limited")
        return (
            <>
                <CardHeading
                    ref={heading}
                    title="We couldn’t load the invitation"
                    description="Check your connection and try again."
                />
                {data.status === "rate-limited" && (
                    <RateLimitNotice ref={notice} remaining={remaining} />
                )}
                {retryButton}
                <ButtonLink
                    to="/workspaces"
                    variant="outline"
                    className="mt-3 w-full"
                >
                    All workspaces
                </ButtonLink>
            </>
        );
    if (data.status === "guest")
        return (
            <>
                <div
                    className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-accent text-primary"
                    aria-hidden="true"
                >
                    <Mail className="size-8" />
                </div>
                <CardHeading
                    ref={heading}
                    title="You’ve been invited"
                    description="Sign in to review your workspace invitation."
                />
                <Notice>
                    <p>Use the email address that received the invitation.</p>
                </Notice>
                <ButtonLink
                    to={withReturnTo("/login", data.path)}
                    className="mt-6 w-full"
                >
                    Sign in
                </ButtonLink>
                <ButtonLink
                    to={withReturnTo("/register", data.path)}
                    variant="outline"
                    className="mt-3 w-full"
                >
                    Create an account
                </ButtonLink>
                <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                    New accounts need a verified email before joining.
                </p>
            </>
        );
    if (data.status === "unverified")
        return (
            <>
                <div
                    className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-accent text-primary"
                    aria-hidden="true"
                >
                    <Mail className="size-8" />
                </div>
                <CardHeading
                    ref={heading}
                    title="Verify your email first"
                    description="Confirm your email address before reviewing this invitation."
                />
                <ButtonLink
                    to={withReturnTo("/verify-email", data.path)}
                    className="w-full"
                >
                    Continue verification
                </ButtonLink>
                <p className="mt-5 text-center text-sm text-muted-foreground">
                    Your invitation will be kept for when you return.
                </p>
                <SignOutForm returnTo={data.path} label="Switch account" />
            </>
        );
    if (data.status === "mismatch")
        return (
            <>
                <div
                    className="mx-auto mt-7 flex size-18 items-center justify-center rounded-full bg-warning-surface text-warning"
                    aria-hidden="true"
                >
                    <UserRound className="size-8" />
                </div>
                <CardHeading
                    ref={heading}
                    title="Use your invited account"
                    description="This invitation is for a different email address."
                />
                <p className="mb-5 text-center text-sm text-muted-foreground">
                    You’re signed in as{" "}
                    <strong className="wrap-anywhere text-foreground">
                        {data.user.email}
                    </strong>
                    .
                </p>
                <Notice>
                    <p>
                        Sign in with the address that received the invitation.
                    </p>
                </Notice>
                <SignOutForm
                    returnTo={data.path}
                    label="Switch account"
                    variant="primary"
                />
                <ButtonLink
                    to="/workspaces"
                    variant="outline"
                    className="mt-3 w-full"
                >
                    All workspaces
                </ButtonLink>
            </>
        );
    if (joined)
        return (
            <div className="card-result">
                <SuccessMark celebrate={Boolean(accepted)} />
                <CardHeading
                    ref={heading}
                    title={accepted ? "You’re in!" : "Already joined"}
                    description={
                        accepted
                            ? `You’ve joined ${accepted.name} as ${accepted.role === "owner" ? "an Owner" : "a Member"}.`
                            : `You already belong to ${data.preview.workspace.name}.`
                    }
                />
                <ButtonLink
                    to={`/w/${accepted?.id ?? data.preview.workspace.id}`}
                    className="w-full"
                >
                    Open workspace
                </ButtonLink>
                <ButtonLink
                    to="/workspaces"
                    variant="ghost"
                    className="mt-3 min-h-11 w-full py-2"
                >
                    All workspaces
                </ButtonLink>
            </div>
        );
    return (
        <>
            <div
                className="mx-auto mt-7 flex size-16 items-center justify-center rounded-xl bg-accent text-xl font-semibold"
                aria-hidden="true"
            >
                {initials(data.preview.workspace.name)}
            </div>
            <CardHeading
                ref={heading}
                title={`Join ${data.preview.workspace.name}`}
                description="You’ve been invited to join this workspace."
            />
            {params.get("account") === "changed" && (
                <Notice
                    tone="warning"
                    className="mb-5"
                    title="Your signed-in account changed"
                >
                    <p>
                        Review the invitation and the account below before
                        accepting.
                    </p>
                </Notice>
            )}
            <dl className="mb-5 space-y-3 rounded-xl border p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted-foreground">Workspace</dt>
                    <dd className="font-semibold wrap-anywhere">
                        {data.preview.workspace.name}
                    </dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Your role</dt>
                    <dd>Member</dd>
                </div>
            </dl>
            <Notice>
                <p className="wrap-anywhere">
                    Joining as <strong>{data.user.email}</strong>
                </p>
            </Notice>
            <p className="my-5 text-center text-xs text-muted-foreground">
                Invitation expires{" "}
                {new Date(data.preview.expires_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                })}
                .
            </p>
            {!pending && result?.status === "error" && (
                <Notice
                    ref={notice}
                    tabIndex={-1}
                    tone="danger"
                    role="alert"
                    className="mb-5"
                    title="We couldn’t confirm you joined"
                >
                    <p>
                        {result.reason === "expired"
                            ? "Your security token expired. Try accepting again."
                            : "Your request may have reached us. Check the invitation before retrying."}
                    </p>
                    {retryButton}
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <RateLimitNotice ref={notice} remaining={remaining} />
            )}
            <fetcher.Form
                method="post"
                aria-label="Accept invitation"
                aria-busy={pending}
                onSubmit={(event) => {
                    if (busy || remaining > 0) event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="accept" />
                <input type="hidden" name="account_id" value={data.user.id} />
                <input
                    type="hidden"
                    name="workspace_id"
                    value={data.preview.workspace.id}
                />
                <fieldset disabled={busy || remaining > 0}>
                    <SubmitButton
                        pending={pending}
                        label="Accept invitation"
                        pendingLabel="Joining workspace…"
                    />
                </fieldset>
            </fetcher.Form>
            <ButtonLink
                to="/workspaces"
                variant="ghost"
                className="mt-3 min-h-11 w-full py-2"
                onClick={() => {
                    forgetInvitation(data.path);
                }}
            >
                Not now
            </ButtonLink>
            <SignOutForm returnTo={data.path} disabled={busy} />
        </>
    );
}
