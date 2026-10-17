import { useRef, useState } from "react";

interface Options {
    min: number;
    max: number;
    initial: number;
    storageKey: string;
}

export function useResizableWidth({ min, max, initial, storageKey }: Options) {
    const clamp = (n: number) => Math.min(max, Math.max(min, n));

    const [width, setWidth] = useState(() => {
        try {
            const saved = Number(localStorage.getItem(storageKey));
            if (saved) return clamp(saved);
        } catch {
            // storage unavailable: fall back to the default
        }
        return initial;
    });

    const widthRef = useRef(width);
    const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startWidth: width };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const next = clamp(dragRef.current.startWidth + (dragRef.current.startX - e.clientX));
        widthRef.current = next;
        setWidth(next);
    };

    const onPointerUp = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        try {
            localStorage.setItem(storageKey, String(widthRef.current));
        } catch {
            // ignore
        }
    };

    return {
        width,
        handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    };
}