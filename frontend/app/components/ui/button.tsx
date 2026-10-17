import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "~/lib/utils";

export function Button({
    className,
    variant = "primary",
    ...props
}: Omit<ButtonPrimitive.Props, "className"> & {
    className?: string | undefined;
    variant?: "primary" | "ghost";
}) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(
                "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-[color,background-color,box-shadow,filter,translate,scale] duration-200 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 motion-safe:active:enabled:scale-[0.98] motion-reduce:transition-none",
                variant === "primary"
                    ? "border border-transparent bg-primary px-4 text-primary-foreground inset-shadow-xs inset-shadow-primary-foreground/20 hover:enabled:shadow-md hover:enabled:shadow-primary/20 hover:enabled:brightness-95 motion-safe:hover:enabled:-translate-y-0.5 motion-safe:active:enabled:translate-y-0"
                    : "text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground",
                className,
            )}
            {...props}
        />
    );
}
