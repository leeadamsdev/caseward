import { useEffect, useRef, useState } from "react";
import type { FormErrors, FormFailure } from "~/lib/api";

export function useFormFeedback<Field extends string>(
    result: FormFailure<Field> | undefined,
    pending: boolean,
    fields: readonly { name: Field }[],
) {
    const formRef = useRef<HTMLFormElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(0);
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
    const errors: FormErrors<Field> =
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
