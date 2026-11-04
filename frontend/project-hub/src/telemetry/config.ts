// Later this should be assigned server-side, per user.
export const VARIANT: 'control' | 'prefetch' = 'control';

export const TELEMETRY_ENABLED = import.meta.env.VITE_TELEMETRY_ENABLED !== 'true';