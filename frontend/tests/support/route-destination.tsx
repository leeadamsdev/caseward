import { useLocation } from "react-router";

export function RouteDestination() {
    const { pathname, search } = useLocation();
    return (
        <output aria-label="Destination">
            {pathname}
            {search}
        </output>
    );
}
