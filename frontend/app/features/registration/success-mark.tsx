import { Check } from "lucide-react";
import type { CSSProperties } from "react";

type ConfettiStyle = CSSProperties &
    Record<"--confetti-x" | "--confetti-y" | "--confetti-turn", string>;

const pieces: ConfettiStyle[] = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    const distance = 4.5 + (index % 3) * 0.75;

    return {
        "--confetti-x": `${(Math.cos(angle) * distance).toString()}rem`,
        "--confetti-y": `${(Math.sin(angle) * distance * 0.6 - 1.25).toString()}rem`,
        "--confetti-turn": `${(180 + index * 47).toString()}deg`,
        animationDelay: `${((index % 4) * 40).toString()}ms`,
    };
});

export function SuccessMark() {
    return (
        <div
            className="relative mx-auto my-8 flex size-20 items-center justify-center rounded-full bg-success-surface text-success"
            aria-hidden="true"
        >
            {pieces.map((style, index) => (
                <span key={index} className="success-confetti" style={style} />
            ))}
            <Check className="relative size-11" strokeWidth={2.5} />
        </div>
    );
}
