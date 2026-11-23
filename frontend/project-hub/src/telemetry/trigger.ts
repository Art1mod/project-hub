import type { TelemetryTrigger } from './types';

// Click handlers record what caused a navigation just before navigating;
// route_change reads it. It expires so a stale value never lands on a later
// navigation, and taking it clears it.

export const PENDING_TRIGGER_TTL_MS = 2000;

let pending: { trigger: TelemetryTrigger; at: number } | null = null;
let lastNav: TelemetryTrigger | null = null;

export function setPendingTrigger(trigger: TelemetryTrigger): void {
    pending = { trigger, at: Date.now() };
}

/** The pending trigger without consuming it, or null once it is older than the TTL. */
export function peekPendingTrigger(): TelemetryTrigger | null {
    if (!pending) return null;
    return Date.now() - pending.at <= PENDING_TRIGGER_TTL_MS ? pending.trigger : null;
}

export function takePendingTrigger(): TelemetryTrigger | null {
    const trigger = peekPendingTrigger();
    pending = null;
    return trigger;
}

/** The trigger of the most recent route_change, for events that arrive after it (e.g. a task opened from the URL). */
export function setLastNavTrigger(trigger: TelemetryTrigger | null): void {
    lastNav = trigger;
}

export function getLastNavTrigger(): TelemetryTrigger | null {
    return lastNav;
}
