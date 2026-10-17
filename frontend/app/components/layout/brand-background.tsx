import "./brand-background.css";

export function BrandBackground() {
    return (
        <div
            className="brand-background pointer-events-none absolute inset-0 -z-10 overflow-clip"
            aria-hidden="true"
        >
            <svg
                className="size-full text-brand-blue/8"
                viewBox="0 0 1440 1000"
                preserveAspectRatio="none"
            >
                <path
                    className="brand-wave brand-wave-top"
                    fill="currentColor"
                    d="M0 240C180 500 280 30 620 150S1120 420 1440 180V0H0Z"
                />
                <path
                    className="brand-wave brand-wave-bottom"
                    fill="currentColor"
                    d="M0 740C250 560 490 1050 790 850S1160 600 1440 720V1000H0Z"
                />
            </svg>
        </div>
    );
}
