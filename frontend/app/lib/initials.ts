export function initials(name: string) {
    const words = name.trim().split(/\s+/u);
    const first = Array.from(words[0] ?? "")[0] ?? "";
    const last =
        words.length > 1 ? (Array.from(words.at(-1) ?? "")[0] ?? "") : "";
    return `${first}${last}`.toLocaleUpperCase();
}
