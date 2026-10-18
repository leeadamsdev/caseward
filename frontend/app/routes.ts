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
        route("forgot-password", "routes/forgot-password.tsx"),
        route("reset-password/:token?", "routes/reset-password.tsx"),
    ]),
    route("account", "routes/account.tsx"),
    route("verify-email", "routes/verify-email.tsx"),
    route("verify-email/change", "routes/change-email.tsx"),
    route("email/verify/:id/:hash", "routes/verify-email-link.tsx"),
    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
