export type Page<T> = {
    data: T[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

// Generated paginator shapes need cross-field checks before driving navigation.
export function validPage(page: Page<{ id: string | number }>) {
    const { data, meta } = page;
    return (
        meta.per_page > 0 &&
        data.length <= meta.per_page &&
        data.length <= meta.total &&
        new Set(data.map((item) => item.id)).size === data.length &&
        meta.last_page === Math.max(1, Math.ceil(meta.total / meta.per_page)) &&
        !(
            data.length === 0 &&
            meta.total > 0 &&
            meta.current_page <= meta.last_page
        )
    );
}
