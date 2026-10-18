import { useEffect, useRef, type ComponentProps } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import type { ApiFailure } from "~/lib/api";
import { cn } from "~/lib/utils";

export function SignOutForm({
    returnTo,
    label = "Sign out",
    variant = "ghost",
    disabled = false,
    className,
    buttonClassName,
}: {
    returnTo?: string;
    label?: string;
    variant?: ComponentProps<typeof Button>["variant"];
    disabled?: boolean;
    className?: string;
    buttonClassName?: string;
}) {
    const navigation = useNavigation();
    const result = useActionData<ApiFailure>();
    const noticeRef = useRef<HTMLDivElement>(null);
    const pending =
        navigation.state !== "idle" &&
        navigation.formData?.get("intent") === "logout";

    useEffect(() => {
        if (!pending && result) noticeRef.current?.focus();
    }, [pending, result]);

    return (
        <div className={cn("mt-6", className)}>
            {!pending && result && (
                <Notice
                    ref={noticeRef}
                    tabIndex={-1}
                    tone="danger"
                    role="alert"
                    className="mb-5"
                    title="We couldn’t confirm you were signed out."
                >
                    <p>
                        {result.reason === "expired"
                            ? "Your security token expired. Please try again."
                            : "Check your connection and try again."}
                    </p>
                </Notice>
            )}
            <Form
                method="post"
                aria-label={label}
                aria-busy={pending}
                onSubmit={(event) => {
                    if (pending || disabled) event.preventDefault();
                }}
            >
                <input type="hidden" name="intent" value="logout" />
                {returnTo && (
                    <input type="hidden" name="returnTo" value={returnTo} />
                )}
                <Button
                    type="submit"
                    variant={variant}
                    disabled={pending || disabled}
                    className={cn("min-h-12 w-full px-4 py-3", buttonClassName)}
                >
                    {pending ? "Signing out…" : label}
                </Button>
            </Form>
            <p className="sr-only" role="status">
                {pending ? "Signing you out. Please wait." : ""}
            </p>
        </div>
    );
}
