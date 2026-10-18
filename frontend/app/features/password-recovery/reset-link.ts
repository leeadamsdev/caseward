export type ResetLink = { token: string; email: string };

export function resetLink(url: URL): ResetLink | undefined {
    const token = /^\/reset-password\/([a-f0-9]{64})$/.exec(url.pathname)?.[1];
    const addresses = url.searchParams.getAll("email");
    const email = addresses[0];
    if (
        !token ||
        addresses.length !== 1 ||
        !email?.trim() ||
        email.length > 254 ||
        email.includes("\0")
    )
        return;
    return { token, email };
}
