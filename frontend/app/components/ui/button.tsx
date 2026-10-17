import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Link, type LinkProps } from "react-router";
import { cn } from "~/lib/utils";

type Variant = "primary" | "ghost" | "outline";

function buttonClass(variant: Variant, className?: string) {
    return cn(
        "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg text-center text-sm font-semibold transition-[color,background-color,box-shadow,filter,translate,scale] duration-200 not-disabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 motion-safe:active:not-disabled:scale-[0.98] motion-reduce:transition-none",
        variant === "primary" &&
            "border border-transparent bg-primary bg-linear-135 from-primary to-[color-mix(in_srgb,var(--brand-violet)_90%,var(--brand-ink))] px-4 py-3 text-primary-foreground inset-shadow-xs inset-shadow-primary-foreground/20 hover:not-disabled:shadow-md hover:not-disabled:shadow-primary/20 hover:not-disabled:brightness-95 motion-safe:hover:not-disabled:-translate-y-0.5 motion-safe:active:not-disabled:translate-y-0",
        variant === "ghost" &&
            "min-h-0 text-muted-foreground hover:not-disabled:bg-accent hover:not-disabled:text-foreground",
        variant === "outline" &&
            "border border-input bg-card px-4 py-3 text-foreground hover:not-disabled:border-primary hover:not-disabled:bg-accent motion-safe:hover:not-disabled:-translate-y-0.5 motion-safe:active:not-disabled:translate-y-0",
        className,
    );
}

export function Button({
    className,
    variant = "primary",
    ...props
}: Omit<ButtonPrimitive.Props, "className"> & {
    className?: string | undefined;
    variant?: Variant;
}) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={buttonClass(variant, className)}
            {...props}
        />
    );
}

export function ButtonLink({
    className,
    variant = "primary",
    ...props
}: LinkProps & { variant?: Variant }) {
    return <Link className={buttonClass(variant, className)} {...props} />;
}
