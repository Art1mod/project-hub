import type { Status } from "../../api/tasks";
import type { WorkloadMetrics } from "../../api/analytics";

export const STATUS_COLORS: Record<Status, string> = {
    TODO: "#71717a",
    IN_PROGRESS: "#8b5cf6",
    DONE: "#10b981",
};

const ORDER: Status[] = ["TODO", "IN_PROGRESS", "DONE"];
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function WorkloadDonut({ metrics }: { metrics: WorkloadMetrics }) {
    const total = ORDER.reduce((sum, s) => sum + metrics[s], 0);
    const donePercent = total === 0 ? 0 : Math.round((metrics.DONE / total) * 100);

    let offset = 0;
    const segments = ORDER.map((status) => {
        const length = total === 0 ? 0 : (metrics[status] / total) * CIRCUMFERENCE;
        const segment = { status, length, offset };
        offset += length;
        return segment;
    });

    return (
        <div className="relative h-48 w-48">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#27272a" strokeWidth="12" />
                {segments.map(
                    (s) =>
                        s.length > 0 && (
                            <circle
                                key={s.status}
                                cx="60"
                                cy="60"
                                r={RADIUS}
                                fill="none"
                                stroke={STATUS_COLORS[s.status]}
                                strokeWidth="12"
                                strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                                strokeDashoffset={-s.offset}
                                className="transition-all duration-500"
                            />
                        ),
                )}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-zinc-50">{donePercent}%</span>
                <span className="text-xs uppercase tracking-wider text-zinc-500">complete</span>
            </div>
        </div>
    );

}