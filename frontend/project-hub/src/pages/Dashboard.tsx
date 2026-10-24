import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getProjects } from "../api/projects";
import { getWorkload } from "../api/analytics";
import { useOrganization } from "../contexts/OrganizationContext";
import { sortProjects } from "../constants/projects";
import { STATUS_OPTIONS } from "../constants/tasks";
import { STATUS_COLORS, WorkloadDonut } from "../components/dashboard/WorkloadDonut";

export function Dashboard() {
    const { activeOrgId } = useOrganization();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: projects = [] } = useQuery({
        queryKey: ["projects", activeOrgId],
        queryFn: () => getProjects(activeOrgId!),
        enabled: !!activeOrgId,
        select: sortProjects,
    });

    const requestedId = searchParams.get("project");
    const selectedProject = projects.find((p) => p.id === requestedId) ?? null;
    const projectId = selectedProject?.id;

    const { data: metrics, isLoading, isError } = useQuery({
        queryKey: ["analytics", "workload", activeOrgId, projectId ?? "all"],
        queryFn: () => getWorkload(activeOrgId!, projectId),
        enabled: !!activeOrgId,
    });

    const selectProject = (id: string) =>
        setSearchParams(id ? { project: id } : {}, { replace: true });

    const destination = projectId ? `/projects/${projectId}` : "/projects";
    const destinationLabel = projectId ? "View tasks" : "View all projects";
    const goToDestination = () => navigate(destination);

    const total = metrics ? metrics.TODO + metrics.IN_PROGRESS + metrics.DONE : 0;
    const open = metrics ? metrics.TODO + metrics.IN_PROGRESS : 0;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-50">Dashboard</h1>
                    <p className="text-sm text-zinc-400">
                        {selectedProject ? selectedProject.name : "All projects"}
                    </p>
                </div>

                <select
                    value={projectId ?? ""}
                    onChange={(e) => selectProject(e.target.value)}
                    className="rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-violet-500 cursor-pointer"
                >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            {isLoading && <div className="text-zinc-400">Loading workload...</div>}
            {isError && <div className="text-red-500">Error fetching workload...</div>}

            {metrics && total === 0 && (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-6 py-16 text-center">
                    <p className="text-base font-medium text-zinc-200">No tasks yet</p>
                    <p className="mt-1 text-sm text-zinc-400">
                        {selectedProject ? "Create a task in this project to see its workload." : "Create a project and add tasks to see your workload."}
                    </p>
                    <button
                        type="button"
                        onClick={goToDestination}
                        className="mt-4 rounded-md bg-violet-600 px-5 py-2 text-sm text-white transition-colors hover:bg-violet-500"
                    >
                        {destinationLabel}
                    </button>
                </div>
            )}

            {metrics && total > 0 && (
                <>
                    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
                        <button
                            type="button"
                            onClick={goToDestination}
                            className="group flex flex-col items-center gap-4 rounded-xl border border-white/10 bg-zinc-900 p-6 text-left transition-colors hover:border-violet-500/50"
                        >
                            <WorkloadDonut metrics={metrics} />
                            <span className="text-sm text-zinc-400 transition-colors group-hover:text-violet-400">
                                {destinationLabel} →
                            </span>
                        </button>

                        <div className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                            {STATUS_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={goToDestination}
                                    className="rounded-xl border border-white/10 bg-zinc-900 p-5 text-left transition-colors hover:border-violet-500/50"
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: STATUS_COLORS[option.value] }}
                                        />
                                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                            {option.label}
                                        </span>
                                    </div>
                                    <div className="mt-3 text-4xl font-bold text-zinc-50">{metrics[option.value]}</div>
                                    <div className="mt-1 text-sm text-zinc-500">
                                        {Math.round((metrics[option.value] / total) * 100)}% of all tasks
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
                        <div className="mb-3 flex items-center justify-between text-sm">
                            <span className="text-zinc-300">
                                <span className="font-semibold text-zinc-50">{open}</span> open of {total} tasks
                            </span>
                            <span className="text-zinc-500">{metrics.DONE} done</span>
                        </div>
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            {STATUS_OPTIONS.map((option) => (
                                <div
                                    key={option.value}
                                    style={{
                                        width: `${(metrics[option.value] / total) * 100}%`,
                                        backgroundColor: STATUS_COLORS[option.value],
                                    }}
                                    className="transition-all duration-500"
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}