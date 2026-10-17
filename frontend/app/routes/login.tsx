import { LoginForm } from "~/features/authentication/login-form";
import { signIn } from "~/features/authentication/login";
import type { Route } from "./+types/login";

export function meta() {
    return [{ title: "Sign in | Caseward" }];
}
export function clientAction({ request }: Route.ClientActionArgs) {
    return signIn(request);
}
export default function Login() {
    return <LoginForm />;
}
