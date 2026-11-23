import type { Connection, Viewport } from './types';

interface NetworkInformation {
    effectiveType?: string;
}

/** Coarse client environment, sent once on session_start. Never exact sizes. */
export function readEnvironment(): { viewport: Viewport; connection: Connection } {
    const width = window.innerWidth;
    const viewport: Viewport = width < 640 ? 'sm' : width < 1024 ? 'md' : 'lg';

    // Not every browser exposes the Network Information API
    const type = (navigator as Navigator & { connection?: NetworkInformation }).connection?.effectiveType;
    const connection: Connection =
        type === 'slow-2g' || type === '2g' ? 'slow'
        : type === '3g' ? 'medium'
        : type === '4g' ? 'fast'
        : 'unknown';

    return { viewport, connection };
}
