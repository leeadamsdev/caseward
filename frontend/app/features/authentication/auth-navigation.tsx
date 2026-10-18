import { ButtonLink } from "~/components/ui/button";

export function AuthNavigation({
    prompt,
    to,
    label,
}: {
    prompt: string;
    to: string;
    label: string;
}) {
    return (
        <footer className="mt-6">
            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <p>{prompt}</p>
                <span className="h-px flex-1 bg-border" />
            </div>
            <ButtonLink to={to} variant="outline" className="w-full">
                {label}
            </ButtonLink>
        </footer>
    );
}
