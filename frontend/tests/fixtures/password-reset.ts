export const resetCredentials = {
    token: "a".repeat(64),
    email: "alex+recovery@example.com",
};
export const resetPath = `/reset-password/${resetCredentials.token}?email=${encodeURIComponent(resetCredentials.email)}`;
export const newPassword = "  A new Unicode passphrase 🔐  ";
