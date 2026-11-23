// Closed vocabularies for the telemetry extension. The frontend keeps its own
// copy in frontend/project-hub/src/telemetry/types.ts: keep both in sync by hand.

export const TELEMETRY_TRIGGERS = [
    'sidebar',
    'dashboard_card',
    'attention_row',
    'attention_modal',
    'project_row',
    'table_row',
    'pagination',
    'browser_history', // a history POP: back or forward cannot be told apart
    'redirect',
] as const;

export const TELEMETRY_ORIGINS = ['real', 'pilot', 'synthetic'] as const;
export type TelemetryOrigin = (typeof TELEMETRY_ORIGINS)[number];

// Rows written before the extension are version 1 (set by the migration).
export const TELEMETRY_SCHEMA_VERSION = 2;
