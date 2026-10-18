export const newPasswordFields = [
    {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Create a password",
    },
    {
        name: "password_confirmation",
        label: "Confirm password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Re-enter your password",
    },
] as const;
