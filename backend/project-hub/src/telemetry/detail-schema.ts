// Per-action allowlist for the `detail` object. Only enums and bounded integers
// are accepted, never free text. Unknown keys are dropped; a known key with an
// invalid value rejects the whole event.

type Check = (value: unknown) => boolean;

const int = (min: number, max: number): Check => (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

const oneOf = (...values: readonly string[]): Check => (v) =>
    typeof v === 'string' && values.includes(v);

const OUTCOME = { outcome: oneOf('used', 'wasted') };

// Chosen by `action:<action>` when an action is present, otherwise `type:<type>`.
const RULES: Record<string, Record<string, Check>> = {
    'type:route_change': { hiddenMs: int(0, 86_400_000) },
    'type:page_ready': { result: oneOf('ok', 'client_error', 'server_error', 'network_error') },
    'type:session_start': {
        viewport: oneOf('sm', 'md', 'lg'),
        connection: oneOf('slow', 'medium', 'fast', 'unknown'),
    },
    'type:prefetch_issued': OUTCOME, // reserved: nothing emits these yet
    'type:prefetch_used': OUTCOME,
    'action:task_update': { field: oneOf('status', 'priority', 'assignee', 'title', 'description') },
    'action:sort_change': {
        sortBy: oneOf('status', 'priority'),
        order: oneOf('asc', 'desc', 'default'),
    },
    'action:project_filter_change': { projectSize: oneOf('all', 'empty', 'small', 'medium', 'large') },
    'action:attention_modal_close': { pagesViewed: int(1, 100) },
    'action:attention_modal_page': { modalPage: int(1, 100) },
};

export type SanitizedDetail =
    | { ok: true; detail: Record<string, string | number> | null }
    | { ok: false };

export function sanitizeDetail(type: string, action: string | undefined, raw: unknown): SanitizedDetail {
    const rules = RULES[action ? `action:${action}` : `type:${type}`];
    if (!rules || typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { ok: true, detail: null };
    }

    // Read only the allowlisted keys: the input is never enumerated.
    const source = raw as Record<string, unknown>;
    const detail: Record<string, string | number> = {};
    for (const key of Object.keys(rules)) {
        const value = source[key];
        if (value === undefined) continue;
        if (!rules[key](value)) return { ok: false };
        detail[key] = value as string | number;
    }

    return { ok: true, detail: Object.keys(detail).length > 0 ? detail : null };
}
