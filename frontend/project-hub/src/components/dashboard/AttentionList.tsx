import { useNavigate } from "react-router-dom";
import type { AttentionTask } from "../../api/analytics";
import { hoverIntent } from "../../telemetry/hover";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../../constants/tasks";

const PRIORITY_BADGE: Record<string, string> = {
    URGENT: "bg-red-500/15 text-red-400",
    HIGH: "bg-orange-500/15 text-orange-400",
};

const label = (options: { value: string; label: string }[], value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

function AttentionRow({ task, showProject }: { task: AttentionTask; showProject: boolean }) {
    const navigate = useNavigate();
    const to = `/projects/${task.project.id}?page=${task.page}&task=${task.id}`;

    return (
        <li>
            <button
                type="button"
                onClick={() => navigate(to)}
                {...hoverIntent(to, { entityType: 'task', entityId: task.id, page: task.page })}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60"
            >
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}>
                    {label(PRIORITY_OPTIONS, task.priority)}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">{task.title}</span>
                    <span className="block truncate text-xs text-zinc-500">
                        {showProject && <>{task.project.name} · </>}
                        {task.assignee?.email ?? "Unassigned"}
                    </span>
                </span>
                <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {label(STATUS_OPTIONS, task.status)}
                </span>
            </button>
        </li>
    );
}

export function AttentionList({ tasks, showProject }: { tasks: AttentionTask[]; showProject: boolean }) {
    return (
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Needs attention</h2>
                <span className="text-xs text-zinc-500">Urgent and high priority</span>
            </div>

            {tasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">Nothing urgent. Nice work.</p>
            ) : (
                <ul className="flex flex-col">
                    {tasks.map((task) => (
                        <AttentionRow key={task.id} task={task} showProject={showProject} />
                    ))}
                </ul>
            )}
        </div>
    );
}