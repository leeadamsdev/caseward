import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/utils";
import { FeedbackReveal } from "./feedback-reveal";

const tones = {
    info: { icon: Info, className: "bg-accent text-accent-foreground" },
    danger: {
        icon: CircleAlert,
        className: "bg-danger-surface text-destructive",
    },
    warning: {
        icon: TriangleAlert,
        className: "bg-warning-surface text-warning",
    },
};

export function Notice({
    tone = "info",
    title,
    children,
    className,
    ...props
}: Omit<ComponentProps<"div">, "title"> & {
    tone?: keyof typeof tones;
    title?: string;
    children: ReactNode;
}) {
    const { icon: Icon, className: toneClassName } = tones[tone];

    return (
        <FeedbackReveal>
            <div
                className={cn(
                    "flex gap-3 rounded-xl p-4 text-sm focus-visible:-outline-offset-2",
                    toneClassName,
                    className,
                )}
                {...props}
            >
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                    {title && <p className="font-semibold">{title}</p>}
                    {children}
                </div>
            </div>
        </FeedbackReveal>
    );
}
