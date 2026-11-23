import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsIn,
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { TELEMETRY_TRIGGERS } from '../telemetry-vocabulary';

export const TELEMETRY_EVENT_TYPES = [
    'route_change', 'link_hover', 'entity_open', 'page_change',
    'page_ready', 'session_start', 'session_end', 'action',
    'prefetch_issued', 'prefetch_used',  
] as const;

export const TELEMETRY_ACTIONS = [
    'task_create', 'task_update', 'task_delete',
    'project_create', 'project_update', 'project_delete',
    'attachment_upload', 'attachment_delete',
    'member_remove', 'invitation_create', 'invitation_cancel',
    'org_create', 'org_update', 'org_delete', 'org_switch',
    'sort_change', 'project_filter_change',
    'attention_modal_open', 'attention_modal_close', 'attention_modal_page',
] as const;

export const TELEMETRY_VARIANTS = ['control', 'prefetch'] as const;
export const TELEMETRY_ENTITY_TYPES = ['project', 'task'] as const;
export const TELEMETRY_CACHE_STATES = ['hit', 'stale', 'miss'] as const;

export const MAX_EVENTS_PER_BATCH = 50;

export class TelemetryEventDto {
    @IsIn(TELEMETRY_EVENT_TYPES)
    readonly type: (typeof TELEMETRY_EVENT_TYPES)[number];

    @IsOptional() @IsString() @MaxLength(200)
    readonly fromRoute?: string;

    @IsOptional() @IsString() @MaxLength(200)
    readonly toRoute?: string;

    @IsOptional() @IsIn(TELEMETRY_ENTITY_TYPES)
    readonly entityType?: (typeof TELEMETRY_ENTITY_TYPES)[number];

    @IsOptional() @IsUUID()
    readonly entityId?: string;

    @IsOptional() @IsInt() @Min(0) @Max(86_400_000)
    readonly dwellMs?: number;

    @IsOptional() @IsInt() @Min(0) @Max(600_000)
    readonly latencyMs?: number;

    @IsISO8601()
    readonly clientTs: string;

    @IsOptional() @IsInt() @Min(1) @Max(10000)
    readonly page?: number;
    
    @IsOptional() @IsIn(TELEMETRY_CACHE_STATES)
    readonly cacheState?: (typeof TELEMETRY_CACHE_STATES)[number];

    @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
    readonly bytes?: number;

    @IsOptional() @IsIn(TELEMETRY_ACTIONS)
    readonly action?: (typeof TELEMETRY_ACTIONS)[number];

    @IsOptional() @IsIn(TELEMETRY_TRIGGERS)
    readonly trigger?: (typeof TELEMETRY_TRIGGERS)[number];

    @IsOptional() @IsInt() @Min(1) @Max(100)
    readonly position?: number;

    // Keys and values are checked per action by sanitizeDetail in the service.
    @IsOptional() @IsObject()
    readonly detail?: Record<string, unknown>;
}

export class CreateTelemetryBatchDto {
    @IsUUID()
    readonly orgId: string;

    @IsUUID()
    readonly sessionId: string;

    @IsIn(TELEMETRY_VARIANTS)
    readonly variant: (typeof TELEMETRY_VARIANTS)[number];

    @ValidateNested({ each: true })
    @Type(() => TelemetryEventDto)
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
    readonly events: TelemetryEventDto[];
}