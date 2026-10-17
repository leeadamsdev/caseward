import { useEffect, useRef } from "react";
import { useRetryCountdown } from "./use-retry-countdown";
import type { FormErrors, FormFailure } from "~/lib/api";

export function useFormFeedback<Field extends string>(
    result: FormFailure<Field> | undefined,
    pending: boolean,
    fields: readonly { name: Field }[],
) {
    const formRef = useRef<HTMLFormElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const remaining = useRetryCountdown(
        result?.status === "rate-limited" ? result : undefined,
    );
    const errors: FormErrors<Field> =
        !pending && result?.status === "validation" ? result.errors : {};

    useEffect(() => {
        if (pending || !result) return;
        if (result.status === "validation") {
            const first = fields.find((field) => result.errors[field.name]);
            const input =
                first && formRef.current?.elements.namedItem(first.name);
            if (input instanceof HTMLElement) input.focus();
        } else noticeRef.current?.focus();
    }, [pending, result, fields]);

    return {
        formRef,
        noticeRef,
        remaining,
        errors,
        disabled: pending || remaining > 0,
    };
}
