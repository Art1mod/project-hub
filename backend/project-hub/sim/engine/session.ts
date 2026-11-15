import { TelemetryEventDto } from '../../src/telemetry/dto/create-telemetry-batch.dto';
import { Step } from '../ai/schemas';
import { CAL } from '../calibration';
import { roleIn, SimUser } from '../population';
import { Rng } from '../rng';
import { SessionSlot } from '../schedule';
import { IdMap } from '../world-db';
import { CacheContext, CacheModel, PageRoute } from './cache-model';
import { attentionTarget, donutTarget, HoverTarget, HoverTracker, hoverTargets, navTarget, projectRowTarget } from './hover';
import { WorldState } from './world-state';

export interface SimEvent {
    orgId: string;
    event: TelemetryEventDto;
}

export interface SimSession {
    sessionId: string;
    userId: string;
    slot: SessionSlot;
    events: SimEvent[];
    leave: 'logout' | 'close_tab';
}

export interface SessionInput {
    slot: SessionSlot;
    steps: Step[];
    user: SimUser;
    /** Shared and mutated across sessions, in slot start order. */
    world: WorldState;
    ids: IdMap;
    /** This user's `new:<n>` refs -> task uuid; persists across the user's sessions. */
    refs: Map<string, string>;
    rng: Rng;
}

type EventFields = Omit<TelemetryEventDto, 'clientTs'>;

const MAX_DWELL_MS = 86_400_000;
const STEP_BASE_MS = 25_000;
const MAX_THINK_MS = 120_000;
const DRIVE_BY_MAX_MS = 55_000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Walks one session's plan on a simulated clock, emitting what the real frontend would track. */
class SessionRunner {
    private t: number;
    private readonly events: SimEvent[] = [];
    private started = false;
    private route: PageRoute | null = null;
    private lastRouteAt: number | null = null;
    private orgId: string;
    private projectId: string | undefined;
    private filter: string | undefined;
    private page = 1;
    private openTask: string | undefined;
    private readonly cache = new CacheModel();
    private readonly hovers = new HoverTracker();
    private readonly pace: number;

    constructor(private readonly input: SessionInput) {
        this.t = input.slot.start.getTime();
        this.orgId = input.slot.startOrgId;
        const natural = Math.max(30_000, input.steps.length * STEP_BASE_MS);
        this.pace = clamp((input.slot.targetMinutes * 60_000) / natural, 0.4, 4);
    }

    private get rng() {
        return this.input.rng;
    }

    private ctx(): CacheContext {
        return { orgId: this.orgId, projectId: this.projectId, dashboardFilter: this.filter };
    }

    private emit(fields: EventFields, at = this.t): void {
        const when = Math.max(Math.round(at), this.t);
        const push = (f: EventFields) => this.events.push({ orgId: this.orgId, event: { ...f, clientTs: new Date(when).toISOString() } as TelemetryEventDto });
        if (!this.started) {
            this.started = true;
            push({ type: 'session_start' } as EventFields);
        }
        push(fields);
        this.t = when;
    }

    private wait(ms: number) {
        this.t += Math.max(0, Math.round(ms));
    }

    private think(scale = 1) {
        this.wait(clamp(this.rng.lognormal(CAL.gapMs.median, CAL.gapMs.p90) * this.pace * scale, 200, MAX_THINK_MS));
    }

    // ---- hovers and navigation ----

    /** Hovers `target`, waiting out the cooldown first if `ensure`. Returns whether an event was emitted. */
    private hover(target: HoverTarget, ensure = false): boolean {
        if (ensure) this.t = Math.max(this.t, Math.ceil(this.hovers.readyAt(target.to)));
        const ev = this.hovers.hover(target, this.route, this.t);
        if (!ev) return false;
        this.emit(ev as EventFields, Date.parse(ev.clientTs));
        return true;
    }

    private scan(n: number, exclude?: HoverTarget) {
        if (!this.route) return;
        const view = { orgId: this.orgId, role: roleIn(this.input.user, this.orgId), projectId: this.projectId, dashboardFilter: this.filter };
        const candidates = hoverTargets(this.route, this.input.world, view).filter((h) => h.toRoute !== this.route && h.to !== exclude?.to);
        if (candidates.length === 0) return;
        for (let i = 0; i < n; i++) {
            this.wait(this.rng.uniform(200, 2500));
            this.hover(this.rng.pick(candidates));
        }
    }

    private scanCount(): number {
        return clamp(Math.round(this.rng.lognormal(CAL.hoversPerNav.median, CAL.hoversPerNav.p90)) - 1, 0, CAL.hoversPerNav.max - 1);
    }

    /** A clicked link: scan hovers, a hover on the target, then the navigation after the hover-to-click lag. */
    private click(target: HoverTarget, opts: { page?: number; task?: string; scan?: number } = {}) {
        this.scan(opts.scan ?? this.scanCount(), target);
        this.wait(this.rng.uniform(150, 900));
        this.hover(target, true);
        this.wait(clamp(this.rng.lognormal(CAL.hoverLagMs.median, CAL.hoverLagMs.p90), 100, 1500));
        const projectId = target.toRoute === '/projects/:id' ? target.entity?.entityType === 'project' ? target.entity.entityId : this.input.world.task(target.entity!.entityId)?.projectId : undefined;
        this.arrive(target.toRoute, { projectId, page: opts.page ?? target.entity?.page, task: opts.task });
    }

    private arrive(toRoute: PageRoute, opts: { projectId?: string; page?: number; task?: string } = {}) {
        const at = this.t;
        this.emit({
            type: 'route_change',
            fromRoute: this.route ?? undefined,
            toRoute,
            dwellMs: this.lastRouteAt === null ? undefined : Math.min(at - this.lastRouteAt, MAX_DWELL_MS),
        } as EventFields);
        this.route = toRoute;
        this.lastRouteAt = at;
        this.projectId = toRoute === '/projects/:id' ? opts.projectId : undefined;
        this.page = opts.page ?? 1;
        this.openTask = opts.task;
        if (toRoute === '/projects/:id' && this.projectId) {
            this.emit({ type: 'entity_open', entityType: 'project', entityId: this.projectId } as EventFields);
        }
        const state = this.cache.mount(toRoute, this.ctx(), at);
        if (state) {
            const latency = Math.round(clamp(this.rng.lognormal(CAL.latencyMs[state].median, CAL.latencyMs[state].p90), 1, 5000));
            this.emit({ type: 'page_ready', toRoute, latencyMs: latency, cacheState: state } as EventFields, at + latency);
        }
        if (opts.task) this.cache.taskPanelOpened(this.ctx(), this.t); // opened from the URL: no entity_open(task)
    }

    private goNav(route: PageRoute) {
        if (this.route === route) return;
        this.click(navTarget(route));
    }

    private openProject(projectId: string | undefined): boolean {
        if (!projectId || !this.input.world.project(projectId)) return false;
        if (this.route === '/projects/:id' && this.projectId === projectId) return true;
        if (this.route === '/dashboard' && this.filter === projectId && this.rng.chance(0.4)) {
            this.click(donutTarget(this.filter));
            return true;
        }
        if (this.route !== '/projects') {
            this.goNav('/projects');
            this.think(0.2);
        }
        this.click(projectRowTarget(projectId), { scan: this.rng.int(0, 2) });
        return true;
    }

    private pageChange(page: number) {
        this.emit({ type: 'page_change', page, entityType: 'project', entityId: this.projectId } as EventFields);
        this.page = page;
        this.openTask = undefined;
    }

    private ensureTaskOpen(taskId: string | undefined): boolean {
        const task = taskId ? this.input.world.task(taskId) : undefined;
        if (!task || !taskId) return false;
        if (this.route === '/projects/:id' && this.projectId === task.projectId && this.openTask === taskId) return true;

        const att = this.route === '/dashboard' ? this.input.world.attention(this.orgId, this.filter).find((a) => a.taskId === taskId) : undefined;
        if (att && this.rng.chance(0.5)) {
            this.click(attentionTarget(att), { task: taskId });
            return true;
        }
        if (!this.openProject(task.projectId)) return false;
        const page = this.input.world.pageOf(taskId);
        if (page !== this.page) {
            this.think(0.3);
            this.pageChange(page);
        }
        this.think(0.5);
        this.emit({ type: 'entity_open', entityType: 'task', entityId: taskId } as EventFields);
        this.cache.taskPanelOpened(this.ctx(), this.t);
        this.openTask = taskId;
        return true;
    }

    private resolveProject(key: string) {
        return this.input.ids.project.get(`${this.orgId}:${key}`);
    }

    private resolveTask(ref: string) {
        return ref.startsWith('new:') ? this.input.refs.get(ref) : this.input.ids.task.get(`${this.orgId}:${ref}`);
    }

    private action(action: string, extra: Partial<EventFields> = {}) {
        this.emit({ type: 'action', action, ...extra } as EventFields);
        this.cache.invalidate(action, this.ctx(), this.t);
    }

    // ---- steps ----

    private runStep(s: Step) {
        const { world, rng } = this.input;
        const at = () => new Date(this.t);
        switch (s.step) {
            case 'scan_dashboard':
                this.goNav('/dashboard');
                this.scan(s.intensity === 'heavy' ? rng.int(6, 24) : rng.int(1, 4));
                return;
            case 'filter_dashboard':
                this.goNav('/dashboard');
                this.think(0.5);
                this.filter = s.projectKey ? this.resolveProject(s.projectKey) : undefined;
                this.cache.observe('/dashboard', this.ctx(), this.t);
                return;
            case 'open_projects_list':
                this.goNav('/projects');
                return;
            case 'open_project':
                this.openProject(this.resolveProject(s.projectKey));
                return;
            case 'browse_tasks': {
                if (!this.openProject(this.resolveProject(s.projectKey))) return;
                const last = world.pageCount(this.projectId!);
                for (const p of s.pages) {
                    const page = Math.min(p, last);
                    if (page === this.page) continue;
                    this.wait(clamp(rng.lognormal(CAL.pageChangeGapMs.median, CAL.pageChangeGapMs.p90), 150, 60_000));
                    this.pageChange(page);
                }
                return;
            }
            case 'open_task':
                this.ensureTaskOpen(this.resolveTask(s.taskRef));
                return;
            case 'update_task': {
                const id = this.resolveTask(s.taskRef);
                if (!this.ensureTaskOpen(id)) return;
                this.think(1);
                world.apply({ action: 'task_update', taskId: id!, at: at(), rng });
                this.action('task_update', { entityType: 'task', entityId: id });
                return;
            }
            case 'create_task': {
                if (!this.openProject(this.resolveProject(s.projectKey))) return;
                this.think(1.5);
                const id = rng.uuid();
                this.input.refs.set(s.ref, id);
                world.apply({ action: 'task_create', projectId: this.projectId!, taskId: id, title: `New task ${s.ref.slice(4)}`, at: at(), rng });
                this.action('task_create', { entityType: 'task', entityId: id });
                return;
            }
            case 'delete_task': {
                const id = this.resolveTask(s.taskRef);
                if (!this.ensureTaskOpen(id)) return;
                this.think(0.8);
                world.apply({ action: 'task_delete', taskId: id!, at: at(), rng });
                this.action('task_delete', { entityType: 'task', entityId: id });
                this.openTask = undefined;
                return;
            }
            case 'upload_attachment': {
                const id = this.resolveTask(s.taskRef);
                if (!this.ensureTaskOpen(id)) return;
                this.think(1.2);
                const bytes = Math.round(clamp(rng.lognormal(3000, 9000), 200, 50_000_000));
                world.apply({ action: 'attachment_upload', taskId: id!, attachmentId: rng.uuid(), uploaderId: this.input.user.id, bytes, at: at(), rng });
                this.action('attachment_upload', { entityType: 'task', entityId: id, latencyMs: rng.int(200, 400), bytes });
                return;
            }
            case 'delete_attachment': {
                const id = this.resolveTask(s.taskRef);
                if (!this.ensureTaskOpen(id) || !world.hasAttachment(id!)) return;
                this.think(0.6);
                world.apply({ action: 'attachment_delete', taskId: id!, at: at(), rng });
                this.action('attachment_delete', { entityType: 'task', entityId: id });
                return;
            }
            case 'create_project': {
                this.goNav('/projects');
                this.think(1.5);
                const id = rng.uuid();
                world.apply({ action: 'project_create', orgId: this.orgId, projectId: id, name: s.name, at: at(), rng });
                this.action('project_create', { entityType: 'project', entityId: id });
                return;
            }
            case 'update_project': {
                if (!this.openProject(this.resolveProject(s.projectKey))) return;
                this.think(1);
                world.apply({ action: 'project_update', projectId: this.projectId!, at: at(), rng });
                this.action('project_update', { entityType: 'project', entityId: this.projectId });
                return;
            }
            case 'delete_project': {
                if (!this.openProject(this.resolveProject(s.projectKey))) return;
                this.think(1);
                const id = this.projectId!;
                world.apply({ action: 'project_delete', projectId: id, at: at(), rng });
                this.action('project_delete', { entityType: 'project', entityId: id });
                this.wait(rng.uniform(100, 400));
                this.arrive('/projects'); // ProjectDetails navigates away after a delete
                return;
            }
            case 'view_members':
                this.goNav('/members');
                return;
            case 'view_invitations':
                this.goNav('/invitations');
                return;
            case 'invite':
            case 'cancel_invitation':
                this.goNav('/invitations');
                this.think(s.step === 'invite' ? 1.5 : 0.6);
                this.action(s.step === 'invite' ? 'invitation_create' : 'invitation_cancel');
                return;
            case 'hover_nav':
                this.wait(rng.uniform(300, 2000));
                this.hover(navTarget(s.route));
                return;
            case 'open_settings':
                this.goNav('/settings');
                return;
            case 'open_profile':
                this.goNav('/profile');
                return;
            case 'switch_org': {
                this.think(0.5);
                this.orgId = s.orgId;
                this.filter = undefined;
                if (this.route === '/projects/:id') {
                    this.wait(rng.uniform(100, 400));
                    this.arrive('/projects'); // ProjectDetails redirects when the active org changes
                } else if (this.route) {
                    this.cache.observe(this.route, this.ctx(), this.t);
                }
                return;
            }
            case 'idle':
                this.wait(s.minutes * 60_000);
                return;
            case 'leave':
                if (s.how === 'logout') {
                    this.think(0.3);
                    this.emit({ type: 'session_end' } as EventFields);
                }
                return;
        }
    }

    private runDriveBy() {
        const start = this.t;
        const n = this.rng.int(1, 4);
        for (let i = 0; i < n && this.t - start < DRIVE_BY_MAX_MS - 10_000; i++) {
            this.wait(this.rng.uniform(1500, 9000));
            this.scan(1);
        }
    }

    run(): SimSession {
        const { slot, steps, user } = this.input;
        const sessionId = this.rng.uuid();
        this.arrive('/dashboard'); // "/" redirects to the dashboard
        if (slot.driveBy) {
            this.runDriveBy();
        } else {
            for (const step of steps) {
                if (step.step !== 'leave') this.think(0.6);
                this.runStep(step);
            }
        }
        return { sessionId, userId: user.id, slot, events: this.events, leave: slot.driveBy ? 'close_tab' : slot.leave };
    }
}

export function simulateSession(input: SessionInput): SimSession {
    return new SessionRunner(input).run();
}
