import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
    return (
        <InputPrimitive
            data-slot="input"
            className={cn(
                "h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive motion-reduce:transition-none sm:text-sm",
                className,
            )}
            {...props}
        />
    );
}
