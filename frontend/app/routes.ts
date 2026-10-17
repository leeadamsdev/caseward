import {
    index,
    layout,
    route,
    type RouteConfig,
} from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    layout("routes/guest.tsx", [
        route("register", "routes/register.tsx"),
        route("login", "routes/login.tsx"),
    ]),
    route("account", "routes/account.tsx"),
    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
