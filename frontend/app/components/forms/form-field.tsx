import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { FeedbackReveal } from "~/components/ui/feedback-reveal";
import { Input } from "~/components/ui/input";

export function FormField({
    name,
    label,
    type,
    autoComplete,
    placeholder,
    errors,
    labelAction,
    visibilityLabel = "password",
}: {
    name: string;
    label: string;
    type: "text" | "email" | "password";
    autoComplete: string;
    placeholder: string;
    errors: string[] | undefined;
    labelAction?: ReactNode;
    visibilityLabel?: string | undefined;
}) {
    const [visible, setVisible] = useState(false);
    const password = type === "password";
    const description = errors ? `${name}-errors` : undefined;

    return (
        <div>
            <div className="mb-2 flex min-h-6 items-center gap-1.5">
                <label className="text-sm font-medium" htmlFor={name}>
                    {label}
                </label>
                {labelAction}
            </div>
            <div className="relative">
                <Input
                    id={name}
                    name={name}
                    type={password && visible ? "text" : type}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={Boolean(errors)}
                    aria-describedby={description}
                    className={password ? "pr-12" : undefined}
                />
                {password && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="absolute inset-y-1 right-1 h-10 w-10 rounded-md"
                        aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`}
                        aria-pressed={visible}
                        aria-controls={name}
                        onClick={() => {
                            setVisible(!visible);
                        }}
                    >
                        {visible ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                            <Eye className="size-4" aria-hidden="true" />
                        )}
                    </Button>
                )}
            </div>
            {errors && (
                <FeedbackReveal>
                    <div
                        id={`${name}-errors`}
                        className="space-y-1 pt-2 text-sm text-destructive"
                    >
                        {errors.map((message) => (
                            <p
                                key={message}
                                className="flex items-start gap-1.5"
                            >
                                <CircleAlert
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                {message}
                            </p>
                        ))}
                    </div>
                </FeedbackReveal>
            )}
        </div>
    );
}
