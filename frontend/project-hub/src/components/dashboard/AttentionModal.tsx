import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAttention } from "../../api/analytics";
import { Modal } from "../Modal";
import { AttentionRow } from "./AttentionList";
import { track } from "../../telemetry/tracker";

const PAGE_SIZE = 10;
const MAX_DWELL_MS = 86_400_000; // matches the server limit

interface Props {
    isOpen: boolean;
    onClose: () => void;
    orgId: string;
    projectId?: string;
}

export function AttentionModal({ isOpen, onClose, orgId, projectId }: Props) {
    const [page, setPage] = useState(1);

    // For the close event: when it opened and which modal pages the user saw
    const openedAt = useRef<number | null>(null);
    const seenPages = useRef(new Set<number>());

    // Records the close once per open. Clearing openedAt makes it safe to call twice.
    const recordClose = useCallback(() => {
        if (openedAt.current === null) return;
        track({
            type: 'action',
            action: 'attention_modal_close',
            dwellMs: Math.min(Date.now() - openedAt.current, MAX_DWELL_MS),
            detail: { pagesViewed: seenPages.current.size },
        });
        openedAt.current = null;
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        openedAt.current = Date.now();
        seenPages.current = new Set([1]);
        // Clicking a row navigates away and unmounts the modal while it is still open,
        // so the close button is not the only way out. No-op if it already recorded it.
        return recordClose;
    }, [isOpen, recordClose]);

    const { data, isLoading, isError, isPlaceholderData } = useQuery({
        queryKey: ["analytics", "attention", orgId, projectId ?? "all", "modal", page],
        queryFn: () => getAttention(orgId, projectId, page, PAGE_SIZE),
        enabled: isOpen,
        placeholderData: keepPreviousData,
    });

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    const goToPage = (next: number) => {
        seenPages.current.add(next);
        track({ type: 'action', action: 'attention_modal_page', detail: { modalPage: next } });
        setPage(next);
    };

    const close = () => {
        recordClose();
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
                        {data.tasks.map((task, index) => (
                            <AttentionRow
                                key={task.id}
                                task={task}
                                showProject={!projectId}
                                trigger="attention_modal"
                                position={index + 1}
                            />
                        ))}
                    </ul>

                    {totalPages > 1 && (
                        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-400">
                            <button
                                type="button"
                                onClick={() => goToPage(page - 1)}
                                disabled={page <= 1 || isPlaceholderData}
                                className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span>Page {page} of {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => goToPage(page + 1)}
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