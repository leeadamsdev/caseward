import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { registrationFields, type RegistrationResult } from "./registration";
import { RegistrationField } from "./registration-field";
import { SuccessMark } from "./success-mark";

export function RegistrationForm() {
    const fetcher = useFetcher<RegistrationResult>();
    const formRef = useRef<HTMLFormElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(0);
    const result = fetcher.data;
    const pending = fetcher.state !== "idle";
    const retryAt =
        result?.status === "rate-limited" ? result.retryAt : undefined;
    const remaining =
        result?.status === "rate-limited"
            ? Math.max(
                  0,
                  Math.ceil(
                      (result.retryAt - Math.max(now, result.receivedAt)) /
                          1000,
                  ),
              )
            : 0;
    const disabled = pending || remaining > 0;
    const errors =
        !pending && result?.status === "validation" ? result.errors : {};

    useEffect(() => {
        if (retryAt === undefined) return;
        const timer = setInterval(() => {
            const time = Date.now();
            setNow(time);
            if (time >= retryAt) clearInterval(timer);
        }, 250);
        return () => {
            clearInterval(timer);
        };
    }, [retryAt]);

    useEffect(() => {
        if (pending || !result) return;
        if (result.status === "validation") {
            const first = registrationFields.find(
                (field) => result.errors[field.name],
            );
            const input =
                first && formRef.current?.elements.namedItem(first.name);
            if (input instanceof HTMLElement) input.focus();
        } else {
            noticeRef.current?.focus();
        }
    }, [pending, result]);

    if (result?.status === "created") {
        return (
            <div
                ref={noticeRef}
                tabIndex={-1}
                className="registration-result rounded-lg text-center outline-none"
                aria-labelledby="registration-title"
            >
                <SuccessMark />
                <h1
                    id="registration-title"
                    className="text-2xl font-semibold tracking-tight"
                >
                    Account created
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Your Caseward account has been created
                    <span className="block">
                        for{" "}
                        <strong className="font-semibold wrap-anywhere text-foreground">
                            {result.email}
                        </strong>
                        .
                    </span>
                </p>
                <Notice title="You’re all set!" className="mt-7 text-left">
                    <p className="leading-6 text-accent-foreground/80">
                        Your account has been created, but you’re not signed in
                        yet and no workspace has been created.
                    </p>
                </Notice>
            </div>
        );
    }

    return (
        <>
            <header className="mt-5 mb-7 text-center">
                <h1
                    id="registration-title"
                    className="text-2xl font-semibold tracking-tight"
                >
                    Create account
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Get started with Caseward.
                </p>
            </header>
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
                        {result.reason === "network"
                            ? "Check your connection and try again. Your previous request may still have reached us."
                            : "Please try again in a moment. Your details have been kept."}
                    </p>
                </Notice>
            )}
            {!pending && result?.status === "rate-limited" && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    tone="warning"
                    title={
                        remaining > 0
                            ? "Too many attempts"
                            : "You can try again"
                    }
                    className="mb-5"
                >
                    <p role="status" aria-live="polite" aria-atomic="true">
                        {remaining > 0 ? (
                            <>
                                Please wait{" "}
                                <span aria-hidden="true">
                                    {remaining}{" "}
                                    {remaining === 1 ? "second" : "seconds"}
                                </span>
                                <span className="sr-only">a little longer</span>{" "}
                                before trying again.
                            </>
                        ) : (
                            "You can try creating your account again."
                        )}
                    </p>
                </Notice>
            )}
            <fetcher.Form
                ref={formRef}
                method="post"
                noValidate
                aria-labelledby="registration-title"
                aria-busy={pending}
                onSubmit={(event) => {
                    if (disabled) event.preventDefault();
                }}
            >
                <fieldset disabled={disabled} className="min-w-0 space-y-5">
                    <legend className="sr-only">Account details</legend>
                    {registrationFields.map((field) => (
                        <RegistrationField
                            key={field.name}
                            {...field}
                            errors={errors[field.name]}
                        />
                    ))}
                    <div
                        id="password-requirements"
                        className="flex gap-3 rounded-xl bg-accent p-4 text-sm"
                    >
                        <LockKeyhole
                            className="mt-0.5 size-5 shrink-0 text-primary"
                            aria-hidden="true"
                        />
                        <div>
                            <p className="font-semibold">
                                Password requirements
                            </p>
                            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-accent-foreground/80">
                                <li>15–128 characters</li>
                                <li>
                                    Spaces and Unicode characters are supported
                                </li>
                                <li>
                                    No mandatory uppercase, number, or symbol
                                    rules
                                </li>
                            </ul>
                        </div>
                    </div>
                    <Button
                        type="submit"
                        className="registration-submit w-full"
                    >
                        {pending && (
                            <LoaderCircle
                                className="size-5 animate-spin motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        )}
                        {pending ? "Creating account…" : "Create account"}
                    </Button>
                </fieldset>
            </fetcher.Form>
        </>
    );
}
