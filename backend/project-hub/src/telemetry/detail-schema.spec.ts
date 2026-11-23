import { sanitizeDetail } from './detail-schema';

describe('sanitizeDetail', () => {
  it('keeps valid keys for route_change', () => {
    expect(sanitizeDetail('route_change', undefined, { hiddenMs: 1200 })).toEqual({
      ok: true,
      detail: { hiddenMs: 1200 },
    });
  });

  it('drops unknown keys and returns null when nothing is left', () => {
    expect(
      sanitizeDetail('route_change', undefined, { title: 'secret', foo: 1 }),
    ).toEqual({ ok: true, detail: null });
  });

  it('keeps the valid key and drops the unknown one in the same object', () => {
    expect(
      sanitizeDetail('route_change', undefined, { hiddenMs: 5, title: 'secret' }),
    ).toEqual({ ok: true, detail: { hiddenMs: 5 } });
  });

  it('rejects a known key with an invalid enum value', () => {
    expect(
      sanitizeDetail('action', 'sort_change', { sortBy: 'status', order: 'sideways' }),
    ).toEqual({ ok: false });
  });

  it('rejects an out-of-range integer', () => {
    expect(sanitizeDetail('action', 'attention_modal_close', { pagesViewed: 101 })).toEqual({ ok: false });
    expect(sanitizeDetail('action', 'attention_modal_close', { pagesViewed: 0 })).toEqual({ ok: false });
    expect(sanitizeDetail('action', 'attention_modal_close', { pagesViewed: 100 })).toEqual({
      ok: true,
      detail: { pagesViewed: 100 },
    });
  });

  it('rejects a non-integer number', () => {
    expect(sanitizeDetail('action', 'attention_modal_page', { modalPage: 1.5 })).toEqual({ ok: false });
  });

  it.each([[[1, 2]], ['text'], [null], [42], [undefined]])(
    'returns null detail for non-object input %p',
    (raw) => {
      expect(sanitizeDetail('route_change', undefined, raw)).toEqual({ ok: true, detail: null });
    },
  );

  it('ignores keys that belong to a different action', () => {
    expect(sanitizeDetail('action', 'sort_change', { field: 'status' })).toEqual({
      ok: true,
      detail: null,
    });
  });

  it('reads only allowlisted keys, never enumerating the input', () => {
    const read: string[] = [];
    let enumerated = false;
    const hostile = new Proxy({} as Record<string, unknown>, {
      get: (_t, key) => {
        read.push(String(key));
        return undefined;
      },
      ownKeys: () => {
        enumerated = true;
        return [];
      },
    });

    expect(sanitizeDetail('route_change', undefined, hostile)).toEqual({ ok: true, detail: null });
    expect(enumerated).toBe(false);
    expect(read).toEqual(['hiddenMs']);
  });

  it('accepts the reserved prefetch outcome', () => {
    expect(sanitizeDetail('prefetch_used', undefined, { outcome: 'wasted' })).toEqual({
      ok: true,
      detail: { outcome: 'wasted' },
    });
    expect(sanitizeDetail('prefetch_issued', undefined, { outcome: 'maybe' })).toEqual({ ok: false });
  });

  it.each([
    ['page_ready', undefined, { result: 'network_error' }],
    ['session_start', undefined, { viewport: 'lg', connection: 'fast' }],
    ['action', 'task_update', { field: 'assignee' }],
    ['action', 'sort_change', { sortBy: 'priority', order: 'default' }],
    ['action', 'project_filter_change', { projectSize: 'all' }],
    ['action', 'attention_modal_page', { modalPage: 2 }],
  ])('accepts valid detail for %s %s', (type, action, raw) => {
    expect(sanitizeDetail(type, action, raw)).toEqual({ ok: true, detail: raw });
  });

  it('rejects an invalid session environment value', () => {
    expect(sanitizeDetail('session_start', undefined, { viewport: 'xl' })).toEqual({ ok: false });
  });
});
