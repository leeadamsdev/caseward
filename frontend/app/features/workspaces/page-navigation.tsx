import { useLocation, useSearchParams } from "react-router";
import { Button, ButtonLink } from "~/components/ui/button";
import type { Page } from "~/lib/pagination";

export function PageNavigation({
    page,
    parameter,
    label,
}: {
    page: Page<unknown>;
    parameter: string;
    label: string;
}) {
    const [params] = useSearchParams();
    const { pathname } = useLocation();
    if (page.meta.last_page <= 1) return null;
    function path(number: number) {
        const next = new URLSearchParams(params);
        next.set(parameter, String(number));
        return `${pathname}?${next.toString()}`;
    }
    return (
        <nav
            aria-label={label}
            className="mt-5 flex flex-wrap items-center justify-between gap-2"
        >
            {page.meta.current_page > 1 ? (
                <ButtonLink
                    variant="outline"
                    to={path(page.meta.current_page - 1)}
                >
                    Previous
                </ButtonLink>
            ) : (
                <Button disabled variant="outline">
                    Previous
                </Button>
            )}
            <p className="text-xs text-muted-foreground">
                Page {page.meta.current_page} of {page.meta.last_page}
            </p>
            {page.meta.current_page < page.meta.last_page ? (
                <ButtonLink
                    variant="outline"
                    to={path(page.meta.current_page + 1)}
                >
                    Next
                </ButtonLink>
            ) : (
                <Button disabled variant="outline">
                    Next
                </Button>
            )}
        </nav>
    );
}
