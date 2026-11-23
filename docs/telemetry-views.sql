-- Readable view over "NavEvent" for Metabase.
--
-- Not part of any migration: apply it by hand to the database Metabase reads,
-- and re-run it after the vocabulary in docs/telemetry.md changes.
-- It keeps every row. Filter on origin = 'real' for analysis, and add
-- schema_version = 2 only when using the new fields (trigger, position, detail).

CREATE OR REPLACE VIEW nav_event_readable AS
SELECT
    e."id",
    e."sessionId"      AS session_id,
    e."clientTs"       AS client_ts,
    e."role",
    e."variant",
    e."origin",
    e."schemaVersion"  AS schema_version,

    e."type",
    CASE e."type"
        WHEN 'session_start'    THEN 'Session start'
        WHEN 'session_end'      THEN 'Session end'
        WHEN 'route_change'     THEN 'Navigation'
        WHEN 'page_ready'       THEN 'Page ready'
        WHEN 'link_hover'       THEN 'Link hover'
        WHEN 'entity_open'      THEN 'Item opened'
        WHEN 'page_change'      THEN 'Table page change'
        WHEN 'action'           THEN 'Action'
        WHEN 'prefetch_issued'  THEN 'Prefetch issued'
        WHEN 'prefetch_used'    THEN 'Prefetch used'
        ELSE e."type"
    END AS type_label,

    e."action",
    CASE e."action"
        WHEN 'task_create'            THEN 'Task created'
        WHEN 'task_update'            THEN 'Task updated'
        WHEN 'task_delete'            THEN 'Task deleted'
        WHEN 'project_create'         THEN 'Project created'
        WHEN 'project_update'         THEN 'Project updated'
        WHEN 'project_delete'         THEN 'Project deleted'
        WHEN 'attachment_upload'      THEN 'Attachment uploaded'
        WHEN 'attachment_delete'      THEN 'Attachment deleted'
        WHEN 'member_remove'          THEN 'Member removed'
        WHEN 'invitation_create'      THEN 'Invitation sent'
        WHEN 'invitation_cancel'      THEN 'Invitation cancelled'
        WHEN 'org_create'             THEN 'Organization created'
        WHEN 'org_update'             THEN 'Organization renamed'
        WHEN 'org_switch'             THEN 'Organization switched'
        WHEN 'org_delete'             THEN 'Organization deleted (intent)'
        WHEN 'sort_change'            THEN 'Sort changed'
        WHEN 'project_filter_change'  THEN 'Dashboard project changed'
        WHEN 'attention_modal_open'   THEN 'Needs attention: modal opened'
        WHEN 'attention_modal_page'   THEN 'Needs attention: modal page'
        WHEN 'attention_modal_close'  THEN 'Needs attention: modal closed'
        ELSE e."action"
    END AS action_label,

    e."trigger",
    CASE e."trigger"
        WHEN 'sidebar'          THEN 'Sidebar link'
        WHEN 'dashboard_card'   THEN 'Dashboard card'
        WHEN 'attention_row'    THEN 'Needs attention row'
        WHEN 'attention_modal'  THEN 'Needs attention modal row'
        WHEN 'project_row'      THEN 'Projects list row'
        WHEN 'table_row'        THEN 'Task table row'
        WHEN 'pagination'       THEN 'Pagination'
        WHEN 'browser_history'  THEN 'Browser back/forward'
        WHEN 'redirect'         THEN 'App redirect'
        ELSE e."trigger"
    END AS trigger_label,

    e."fromRoute"      AS from_route,
    e."toRoute"        AS to_route,
    e."entityType"     AS entity_type,
    e."entityHash"     AS entity_hash,
    e."dwellMs"        AS dwell_ms,
    e."latencyMs"      AS latency_ms,
    e."cacheState"     AS cache_state,
    e."page",
    e."position",
    e."bytes",

    -- detail, flattened (values are validated enums and integers)
    NULLIF(e."detail" ->> 'hiddenMs', '')::int     AS hidden_ms,
    e."detail" ->> 'result'                        AS page_result,
    e."detail" ->> 'viewport'                      AS viewport,
    e."detail" ->> 'connection'                    AS connection,
    e."detail" ->> 'field'                         AS edited_field,
    e."detail" ->> 'sortBy'                        AS sort_by,
    e."detail" ->> 'order'                         AS sort_order,
    e."detail" ->> 'projectSize'                   AS project_size,
    NULLIF(e."detail" ->> 'pagesViewed', '')::int  AS pages_viewed,
    NULLIF(e."detail" ->> 'modalPage', '')::int    AS modal_page,
    e."detail" ->> 'outcome'                       AS prefetch_outcome
FROM "NavEvent" e;
