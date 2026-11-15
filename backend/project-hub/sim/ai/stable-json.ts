/** JSON with object keys sorted at every level, so saved files and prompt prefixes are byte-stable. */
export function stableStringify(value: unknown, indent = 2): string {
    const sort = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(sort);
        if (v && typeof v === 'object' && !(v instanceof Date)) {
            return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
        }
        return v;
    };
    return JSON.stringify(sort(value), null, indent);
}
