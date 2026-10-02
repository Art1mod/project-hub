import type { ReactNode } from "react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function Modal ({isOpen, onClose, title, children}: ModalProps) {
    if (!isOpen) return null;

    return(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-lg p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-zinc-50">{title}</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
                        X
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}