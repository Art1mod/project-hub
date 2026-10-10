import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    pendingLabel?: string;
    isPending?: boolean;
    error?: string | null;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Confirm",
    pendingLabel = "Working...",
    isPending = false,
    error,
}: ConfirmModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="mb-6 text-zinc-300">{message}</div>

            {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isPending}
                    className="rounded-md px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={isPending}
                    className="rounded-md bg-red-600 px-6 py-2 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all hover:bg-red-500 hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending ? pendingLabel : confirmLabel}
                </button>
            </div>
        </Modal>
    );
}