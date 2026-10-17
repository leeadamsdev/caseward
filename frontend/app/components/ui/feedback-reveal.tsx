import type { ReactNode } from "react";

export function FeedbackReveal({ children }: { children: ReactNode }) {
    return (
        <div className="feedback-reveal">
            <div className="min-h-0 overflow-clip">{children}</div>
        </div>
    );
}
