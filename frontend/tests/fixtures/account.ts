import type { UserResource as User } from "~/generated/api/models";

export const password = "  a long Unicode passphrase 🔐  ";
export const account = {
    name: "Alex Chen",
    email: "alex.chen@example.com",
    password,
    password_confirmation: password,
};
export const user = {
    id: 7,
    name: account.name,
    email: account.email,
    email_verified: true,
} satisfies User;
