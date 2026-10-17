import { RegistrationForm } from "~/features/registration/registration-form";
import { registerAccount } from "~/features/registration/registration";
import type { Route } from "./+types/register";
import "~/features/registration/registration.css";

export function meta() {
    return [{ title: "Create account | Caseward" }];
}

export function clientAction({ request }: Route.ClientActionArgs) {
    return registerAccount(request);
}

export default function Register() {
    return (
        <main className="registration-page relative isolate flex min-h-svh items-center justify-center overflow-clip px-4 py-8 sm:px-6 sm:py-12">
            <svg
                className="pointer-events-none absolute inset-0 -z-10 size-full text-brand-blue/8"
                viewBox="0 0 1440 1000"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path
                    className="registration-wave registration-wave-top"
                    fill="currentColor"
                    d="M0 240C180 500 280 30 620 150S1120 420 1440 180V0H0Z"
                />
                <path
                    className="registration-wave registration-wave-bottom"
                    fill="currentColor"
                    d="M0 740C250 560 490 1050 790 850S1160 600 1440 720V1000H0Z"
                />
            </svg>
            <section
                className="registration-card w-full max-w-120 rounded-2xl border border-border/70 bg-card px-5 py-8 text-card-foreground shadow-[0_12px_60px_-20px_color-mix(in_srgb,var(--brand-blue)_18%,transparent)] sm:px-9 sm:py-9"
                aria-labelledby="registration-title"
            >
                <img
                    src="/logos/caseward-logo-light.svg"
                    alt="Caseward"
                    width="511"
                    height="136"
                    className="mx-auto h-auto w-44"
                />
                <RegistrationForm />
            </section>
        </main>
    );
}
