import { LoaderCircle } from "lucide-react";
import type { Ref } from "react";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";

export function SubmitButton({
    pending,
    label,
    pendingLabel,
}: {
    pending: boolean;
    label: string;
    pendingLabel: string;
}) {
    return (
        <Button type="submit" className="w-full">
            {pending && (
                <LoaderCircle
                    className="size-5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                />
            )}
            {pending ? pendingLabel : label}
        </Button>
    );
}

export function RateLimitNotice({
    remaining,
    ref,
}: {
    remaining: number;
    ref: Ref<HTMLDivElement>;
}) {
    return (
        <Notice
            ref={ref}
            tabIndex={-1}
            tone="warning"
            title={remaining > 0 ? "Too many attempts" : "You can try again"}
            className="mb-5"
        >
            <p role="status" aria-live="polite" aria-atomic="true">
                {remaining > 0 ? (
                    <>
                        Please wait{" "}
                        <span aria-hidden="true">
                            {remaining} {remaining === 1 ? "second" : "seconds"}
                        </span>
                        <span className="sr-only">a little longer</span> before
                        trying again.
                    </>
                ) : (
                    "You can try again now."
                )}
            </p>
        </Notice>
    );
}
