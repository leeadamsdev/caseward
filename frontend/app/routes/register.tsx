import { RegistrationForm } from "~/features/registration/registration-form";
import { registerAccount } from "~/features/registration/registration";
import type { Route } from "./+types/register";

export function meta() {
    return [{ title: "Create account | Caseward" }];
}
export function clientAction({ request }: Route.ClientActionArgs) {
    return registerAccount(request);
}
export default function Register() {
    return <RegistrationForm />;
}
