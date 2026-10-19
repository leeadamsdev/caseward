export function verificationPath(value: string | null): string | undefined {
    if (
        !value ||
        !/^\/email\/verify\/[1-9]\d*\/[a-f0-9]{40}(?:\?[^#]*)?$/.test(value)
    )
        return;
    const url = new URL(value, "https://caseward.invalid");
    if (value === url.pathname + url.search) return value;
}
