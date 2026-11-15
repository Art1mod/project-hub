import { Prisma, Priority, Status } from '@prisma/client';
import { CAL } from '../calibration';
import { Rng } from '../rng';
import { WorldRows } from '../world-db';

export interface StateTask {
    id: string;
    projectId: string;
    title: string;
    status: Status;
    priority: Priority;
    assigneeId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface StateProject {
    id: string;
    orgId: string;
    name: string;
}

export interface AttentionItem {
    taskId: string;
    projectId: string;
    page: number;
}

export type WorldAction =
    | { action: 'task_create'; projectId: string; taskId: string; title: string; at: Date; rng: Rng }
    | { action: 'task_update'; taskId: string; at: Date; rng: Rng; status?: Status; priority?: Priority }
    | { action: 'task_delete'; taskId: string; at: Date; rng: Rng }
    | { action: 'project_create'; orgId: string; projectId: string; name: string; at: Date; rng: Rng }
    | { action: 'project_update'; projectId: string; at: Date; rng: Rng }
    | { action: 'project_delete'; projectId: string; at: Date; rng: Rng }
    | { action: 'attachment_upload'; taskId: string; attachmentId: string; uploaderId: string; bytes: number; at: Date; rng: Rng }
    | { action: 'attachment_delete'; taskId: string; at: Date; rng: Rng };

export interface WorldChanges {
    tasks: {
        created: Prisma.TaskCreateManyInput[];
        updated: { id: string; status: Status; priority: Priority; updatedAt: Date }[];
        deleted: string[];
    };
    projects: {
        created: Prisma.ProjectCreateManyInput[];
        updated: { id: string; updatedAt: Date }[];
        deleted: string[];
    };
    attachments: { created: Prisma.AttachmentCreateManyInput[] };
}

const STATUS_ORDER: Status[] = ['TODO', 'IN_PROGRESS', 'DONE'];
const PRIORITY_ORDER: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const OPEN: ReadonlySet<Status> = new Set(['TODO', 'IN_PROGRESS']);
const URGENT: ReadonlySet<Priority> = new Set(['HIGH', 'URGENT']);
const FILES = [['notes.pdf', 'application/pdf'], ['screenshot.png', 'image/png'], ['spec.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['data.csv', 'text/csv']] as const;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Same ordering as the task table (and the analytics page lookup): status asc, priority desc, title, id. */
function tableOrder(a: StateTask, b: StateTask): number {
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || PRIORITY_ORDER.indexOf(b.priority) - PRIORITY_ORDER.indexOf(a.priority)
        || cmp(a.title, b.title) || cmp(a.id, b.id);
}

/** Attention list ordering: priority desc, status asc, title, id. */
function attentionOrder(a: StateTask, b: StateTask): number {
    return PRIORITY_ORDER.indexOf(b.priority) - PRIORITY_ORDER.indexOf(a.priority)
        || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || cmp(a.title, b.title) || cmp(a.id, b.id);
}

/** The simulated orgs' projects and tasks as they change during the run. */
export class WorldState {
    private readonly tasks = new Map<string, StateTask>();
    private readonly projects = new Map<string, StateProject>();
    private readonly initialTasks = new Set<string>();
    private readonly initialProjects = new Set<string>();
    private readonly updatedTasks = new Set<string>();
    private readonly updatedProjects = new Map<string, Date>();
    private readonly deletedTasks = new Set<string>();
    private readonly deletedProjects = new Set<string>();
    private readonly attachments = new Map<string, Prisma.AttachmentCreateManyInput>();

    constructor(rows: WorldRows) {
        for (const p of rows.projects) {
            this.projects.set(p.id!, { id: p.id!, orgId: p.organizationId, name: p.name });
            this.initialProjects.add(p.id!);
        }
        for (const t of rows.tasks) {
            const createdAt = new Date(t.createdAt ?? 0);
            this.tasks.set(t.id!, {
                id: t.id!, projectId: t.projectId, title: t.title, status: t.status ?? 'TODO', priority: t.priority ?? 'MEDIUM',
                assigneeId: t.assigneeId ?? null, createdAt, updatedAt: new Date(t.updatedAt ?? createdAt),
            });
            this.initialTasks.add(t.id!);
        }
    }

    project(id: string): StateProject | undefined {
        return this.projects.get(id);
    }

    task(id: string): StateTask | undefined {
        return this.tasks.get(id);
    }

    projectsOf(orgId: string): StateProject[] {
        return [...this.projects.values()].filter((p) => p.orgId === orgId).sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
    }

    tasksOf(projectId: string): StateTask[] {
        return [...this.tasks.values()].filter((t) => t.projectId === projectId).sort(tableOrder);
    }

    pageCount(projectId: string): number {
        return Math.max(1, Math.ceil(this.tasksOf(projectId).length / CAL.tasksPerPage));
    }

    pageOf(taskId: string): number {
        const task = this.tasks.get(taskId);
        if (!task) return 1;
        const rank = this.tasksOf(task.projectId).findIndex((t) => t.id === taskId);
        return Math.floor(rank / CAL.tasksPerPage) + 1;
    }

    attention(orgId: string, projectId?: string): AttentionItem[] {
        return [...this.tasks.values()]
            .filter((t) => OPEN.has(t.status) && URGENT.has(t.priority))
            .filter((t) => (projectId ? t.projectId === projectId : this.projects.get(t.projectId)?.orgId === orgId))
            .sort(attentionOrder)
            .slice(0, CAL.attentionTake)
            .map((t) => ({ taskId: t.id, projectId: t.projectId, page: this.pageOf(t.id) }));
    }

    apply(a: WorldAction): void {
        switch (a.action) {
            case 'task_create': {
                const priority = a.rng.weighted<Priority>([['LOW', 0.2], ['MEDIUM', 0.5], ['HIGH', 0.2], ['URGENT', 0.1]]);
                this.tasks.set(a.taskId, { id: a.taskId, projectId: a.projectId, title: a.title, status: 'TODO', priority, assigneeId: null, createdAt: a.at, updatedAt: a.at });
                return;
            }
            case 'task_update': {
                const t = this.tasks.get(a.taskId);
                if (!t) return;
                if (a.status || a.priority) {
                    t.status = a.status ?? t.status;
                    t.priority = a.priority ?? t.priority;
                } else if (a.rng.chance(0.65)) {
                    const i = STATUS_ORDER.indexOf(t.status);
                    t.status = i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : 'IN_PROGRESS';
                } else {
                    t.priority = a.rng.pick(PRIORITY_ORDER.filter((p) => p !== t.priority));
                }
                t.updatedAt = a.at;
                this.updatedTasks.add(t.id);
                return;
            }
            case 'task_delete':
                if (this.tasks.delete(a.taskId)) this.deletedTasks.add(a.taskId);
                for (const [id, att] of this.attachments) if (att.taskId === a.taskId) this.attachments.delete(id);
                return;
            case 'project_create':
                this.projects.set(a.projectId, { id: a.projectId, orgId: a.orgId, name: a.name });
                return;
            case 'project_update':
                if (this.projects.has(a.projectId)) this.updatedProjects.set(a.projectId, a.at);
                return;
            case 'project_delete':
                if (!this.projects.delete(a.projectId)) return;
                this.deletedProjects.add(a.projectId);
                for (const t of [...this.tasks.values()]) {
                    if (t.projectId === a.projectId) this.apply({ action: 'task_delete', taskId: t.id, at: a.at, rng: a.rng });
                }
                return;
            case 'attachment_upload': {
                const [filename, mimeType] = a.rng.pick(FILES);
                this.attachments.set(a.attachmentId, {
                    id: a.attachmentId, taskId: a.taskId, uploaderId: a.uploaderId, filename, mimeType, size: a.bytes,
                    storageKey: `sim/${a.attachmentId}`, createdAt: a.at,
                });
                return;
            }
            case 'attachment_delete': {
                const ofTask = [...this.attachments.values()].filter((x) => x.taskId === a.taskId);
                const last = ofTask.at(-1);
                if (last) this.attachments.delete(last.id!);
                return;
            }
        }
    }

    hasAttachment(taskId: string): boolean {
        return [...this.attachments.values()].some((x) => x.taskId === taskId);
    }

    /** What to write back to the sim database after the run. */
    changes(): WorldChanges {
        const created = [...this.tasks.values()].filter((t) => !this.initialTasks.has(t.id));
        return {
            tasks: {
                created: created.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, projectId: t.projectId, assigneeId: t.assigneeId, createdAt: t.createdAt, updatedAt: t.updatedAt })),
                updated: [...this.updatedTasks].filter((id) => this.initialTasks.has(id) && this.tasks.has(id)).map((id) => {
                    const t = this.tasks.get(id)!;
                    return { id, status: t.status, priority: t.priority, updatedAt: t.updatedAt };
                }),
                deleted: [...this.deletedTasks].filter((id) => this.initialTasks.has(id)),
            },
            projects: {
                created: [...this.projects.values()].filter((p) => !this.initialProjects.has(p.id)).map((p) => ({ id: p.id, name: p.name, organizationId: p.orgId })),
                updated: [...this.updatedProjects].filter(([id]) => this.initialProjects.has(id) && this.projects.has(id)).map(([id, updatedAt]) => ({ id, updatedAt })),
                deleted: [...this.deletedProjects].filter((id) => this.initialProjects.has(id)),
            },
            attachments: { created: [...this.attachments.values()] },
        };
    }
}
