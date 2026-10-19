export function invitationPath(value: string | null): string | undefined {
    return value && /^\/invitations\/[a-f0-9]{64}$/.test(value)
        ? value
        : undefined;
}
