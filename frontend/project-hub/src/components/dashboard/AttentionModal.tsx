import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAttention } from "../../api/analytics";
import { Modal } from "../Modal";
import { AttentionRow } from "./AttentionList";

const PAGE_SIZE = 10;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    orgId: string;
    projectId?: string;
}

export function AttentionModal({ isOpen, onClose, orgId, projectId }: Props) {
    const [page, setPage] = useState(1);

    const { data, isLoading, isError, isPlaceholderData } = useQuery({
        queryKey: ["analytics", "attention", orgId, projectId ?? "all", "modal", page],
        queryFn: () => getAttention(orgId, projectId, page, PAGE_SIZE),
        enabled: isOpen,
        placeholderData: keepPreviousData,
    });

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    const close = () => {
        setPage(1);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title="Needs attention">
            {isLoading && <p className="py-6 text-center text-sm text-zinc-400">Loading...</p>}
            {isError && <p className="py-6 text-center text-sm text-red-400">Could not load tasks.</p>}

            {data && (
                <>
                    <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
                        {data.tasks.map((task) => (
                            <AttentionRow key={task.id} task={task} showProject={!projectId} />
                        ))}
                    </ul>

                    {totalPages > 1 && (
                        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-400">
                            <button
                                type="button"
                                onClick={() => setPage((p) => p - 1)}
                                disabled={page <= 1 || isPlaceholderData}
                                className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span>Page {page} of {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={page >= totalPages || isPlaceholderData}
                                className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}