import type { ShouldRevalidateFunctionArgs } from "react-router";
import { isRecord } from "~/lib/api";

export function shouldRevalidateForm({
    actionResult,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
    // A session recheck must not replace a failed form's feedback or discard its input.
    if (
        isRecord(actionResult) &&
        (actionResult.status === "error" ||
            actionResult.status === "validation" ||
            actionResult.status === "rate-limited")
    )
        return false;
    return defaultShouldRevalidate;
}
