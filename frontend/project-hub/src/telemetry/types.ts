// Closed vocabularies for telemetry events. Keep in sync by hand with
// backend/project-hub/src/telemetry/telemetry-vocabulary.ts, detail-schema.ts
// and dto/create-telemetry-batch.dto.ts. Only enums and numbers are ever sent.

export type TelemetryTrigger =
    | 'sidebar'
    | 'dashboard_card'
    | 'attention_row'
    | 'attention_modal'
    | 'project_row'
    | 'table_row'
    | 'pagination'
    | 'browser_history' // a history POP: back or forward cannot be told apart
    | 'redirect';

export type TelemetryAction =
    | 'task_create' | 'task_update' | 'task_delete'
    | 'project_create' | 'project_update' | 'project_delete'
    | 'attachment_upload' | 'attachment_delete'
    | 'member_remove' | 'invitation_create' | 'invitation_cancel'
    | 'org_create' | 'org_update' | 'org_delete' | 'org_switch'
    | 'sort_change' | 'project_filter_change'
    | 'attention_modal_open' | 'attention_modal_close' | 'attention_modal_page';

export type SizeBucket = 'all' | 'empty' | 'small' | 'medium' | 'large';
export type TaskField = 'status' | 'priority' | 'assignee' | 'title' | 'description';
export type PageResult = 'ok' | 'client_error' | 'server_error' | 'network_error';
export type Viewport = 'sm' | 'md' | 'lg';
export type Connection = 'slow' | 'medium' | 'fast' | 'unknown';

export interface TelemetryDetail {
    hiddenMs?: number;                  // route_change
    result?: PageResult;                // page_ready
    viewport?: Viewport;                // session_start
    connection?: Connection;            // session_start
    field?: TaskField;                  // task_update (the field name, never its value)
    sortBy?: 'status' | 'priority';     // sort_change
    order?: 'asc' | 'desc' | 'default'; // sort_change
    projectSize?: SizeBucket;           // project_filter_change
    pagesViewed?: number;               // attention_modal_close
    modalPage?: number;                 // attention_modal_page
    outcome?: 'used' | 'wasted';        // prefetch_issued / prefetch_used (reserved)
}
