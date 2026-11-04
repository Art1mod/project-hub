import { API_URL } from '../lib/config';
import { VARIANT } from './config';

export type TelemetryEventType =
    | 'route_change' | 'link_hover' | 'entity_open' | 'page_change'
    | 'page_ready' | 'session_start' | 'session_end' | 'action'
    | 'prefetch_issued' | 'prefetch_used';

export interface TelemetryEvent {
    type: TelemetryEventType;
    fromRoute?: string;
    toRoute?: string;
    entityType?: 'project' | 'task';
    entityId?: string; // hashed by the server, never stored raw
    dwellMs?: number;
    latencyMs?: number;
    clientTs: string;
    page?: number;
    bytes?: number;
    cacheState?: 'hit' | 'stale' | 'miss';
    action?: string;
}

export interface TelemetryBatch {
    orgId: string;
    sessionId: string;
    variant: string;
    events: TelemetryEvent[];
}

/** Anything that can receive batches. A Firebase sink could implement this too. */
export interface TelemetrySink {
    send(batch: TelemetryBatch, keepalive: boolean): Promise<void>;
}

class HttpSink implements TelemetrySink {
    async send(batch: TelemetryBatch, keepalive: boolean) {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            await fetch(`${API_URL}/telemetry/events`, {
                method: 'POST',
                keepalive, // lets the request outlive the page on unload
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(batch),
            });
        } catch {
            // Telemetry must never affect the app, so the batch is dropped
        }
    }
}

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT = 20;
const MAX_QUEUE = 200;
const MAX_BATCH = 50; // must match the backend limit
const SESSION_KEY = 'telemetry-session';

let memorySessionId: string | null = null;

function getSessionId(): string {
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        memorySessionId ??= crypto.randomUUID();
        return memorySessionId;
    }
}

const STARTED_KEY = 'telemetry-session-started';
let memoryStarted = false;

/** True only for the first call of a session. */
function markSessionStarted(): boolean {
    try {
        if (sessionStorage.getItem(STARTED_KEY)) return false;
        sessionStorage.setItem(STARTED_KEY, '1');
        return true;
    } catch {
        if (memoryStarted) return false;
        memoryStarted = true;
        return true;
    }
}

function hasSessionStarted(): boolean {
    try {
        return !!sessionStorage.getItem(STARTED_KEY);
    } catch {
        return memoryStarted;
    }
}

interface Queued {
    orgId: string;
    event: TelemetryEvent;
}

class Tracker {
    private queue: Queued[] = [];
    private orgId: string | null = null;
    private currentRoute: string | null = null;
    private started = false;
    private sink: TelemetrySink;

    constructor(sink: TelemetrySink) {
        this.sink = sink
    }

    setOrg(orgId: string | null) {
        this.orgId = orgId;
    }

    setRoute(route: string | null) {
        this.currentRoute = route;
    }

    getRoute() {
        return this.currentRoute;
    }

    track(event: Omit<TelemetryEvent, 'clientTs'>) {
        if (!this.orgId || !localStorage.getItem('token')) return;
        this.start();

        if (markSessionStarted()) this.enqueue(this.orgId, { type: 'session_start' });
        this.enqueue(this.orgId, event);
    }

    private enqueue(orgId: string, event: Omit<TelemetryEvent, 'clientTs'>) {
        this.queue.push({ orgId, event: { ...event, clientTs: new Date().toISOString() } });
        if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
        if (this.queue.length >= FLUSH_AT) this.flush(false);
    }

    flush(keepalive = false) {
        if (this.queue.length === 0) return;
        const items = this.queue;
        this.queue = [];

        // One batch only ever contains one organization
        const byOrg = new Map<string, TelemetryEvent[]>();
        for (const { orgId, event } of items) {
            const list = byOrg.get(orgId) ?? [];
            list.push(event);
            byOrg.set(orgId, list);
        }

        const sessionId = getSessionId();
        for (const [orgId, events] of byOrg) {
            for (let i = 0; i < events.length; i += MAX_BATCH) {
                void this.sink.send(
                    { orgId, sessionId, variant: VARIANT, events: events.slice(i, i + MAX_BATCH) },
                    keepalive,
                );
            }
        }
    }

    /** Called on logout: send what is left, then forget the session. */
    endSession() {
        if (this.orgId && hasSessionStarted()) this.enqueue(this.orgId, { type: 'session_end' });
        this.flush(true);
        try {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(STARTED_KEY);
        } catch {
            // ignore
        }
        memorySessionId = null;
        memoryStarted = false;
        this.orgId = null;
        this.currentRoute = null;
    }

    private start() {
        if (this.started) return;
        this.started = true;

        window.setInterval(() => this.flush(false), FLUSH_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush(true);
        });
        window.addEventListener('pagehide', () => this.flush(true));
    }
}

const tracker = new Tracker(new HttpSink());

export const track = tracker.track.bind(tracker);
export const setTelemetryOrg = tracker.setOrg.bind(tracker);
export const setTelemetryRoute = tracker.setRoute.bind(tracker);
export const getTelemetryRoute = tracker.getRoute.bind(tracker);
export const endTelemetrySession = tracker.endSession.bind(tracker);