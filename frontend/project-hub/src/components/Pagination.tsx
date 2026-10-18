interface PaginationProps {
    page: number;
    totalPages: number;
    total: number;
    onChange: (page: number) => void;
    disabled?: boolean;
}

const buttonClass =
    "rounded-md border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function Pagination({ page, totalPages, total, onChange, disabled = false }: PaginationProps) {
    return (
        <div className="flex items-center justify-between px-1 pt-3 text-sm text-zinc-400">
            <span>{total} tasks</span>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onChange(page - 1)}
                    disabled={disabled || page <= 1}
                    className={buttonClass}
                >
                    Previous
                </button>
                <span>
                    Page {page} of {totalPages}
                </span>
                <button
                    type="button"
                    onClick={() => onChange(page + 1)}
                    disabled={disabled || page >= totalPages}
                    className={buttonClass}
                >
                    Next
                </button>
            </div>
        </div>
    );
}