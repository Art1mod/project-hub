import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAttachment, getAttachments, uploadAttachment, type Attachment } from "../../api/attachments";
import {
    ALLOWED_ATTACHMENT_TYPES,
    MAX_ATTACHMENT_SIZE,
    MAX_ATTACHMENTS_PER_TASK,
    formatBytes,
} from "../../constants/attachments";
import { ConfirmModal } from "../ConfirmModal";

const labelClass = "text-xs font-semibold uppercase tracking-wider text-zinc-500";

const errorText = (err: any, fallback: string) => {
    const message = err?.response?.data?.message;
    return Array.isArray(message) ? message.join(", ") : message ?? fallback;
};

export function TaskAttachments({ taskId }: { taskId: string }) {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [toDelete, setToDelete] = useState<Attachment | null>(null);

    const { data: attachments = [], isLoading } = useQuery({
        queryKey: ["attachments", taskId],
        queryFn: () => getAttachments(taskId),
        refetchInterval: 10 * 60 * 1000, // download links expire after 15 minutes
    });

    const uploadMutation = useMutation({
        mutationFn: async (files: File[]) => {
            const problems: string[] = [];
            let remaining = MAX_ATTACHMENTS_PER_TASK - attachments.length;

            for (const file of files) {
                if (remaining <= 0) {
                    problems.push(`${file.name}: limit of ${MAX_ATTACHMENTS_PER_TASK} files reached`);
                    continue;
                }
                if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
                    problems.push(`${file.name}: only images (PNG, JPG, WebP, GIF) and PDFs are allowed`);
                    continue;
                }
                if (file.size > MAX_ATTACHMENT_SIZE) {
                    problems.push(`${file.name}: larger than ${formatBytes(MAX_ATTACHMENT_SIZE)}`);
                    continue;
                }

                try {
                    setProgress({ name: file.name, percent: 0 });
                    await uploadAttachment(taskId, file, (percent) => setProgress({ name: file.name, percent }));
                    remaining--;
                } catch (err) {
                    problems.push(`${file.name}: ${errorText(err, "upload failed")}`);
                }
            }
            return problems;
        },
        onSuccess: async (problems) => {
            setErrors(problems);
            await queryClient.invalidateQueries({ queryKey: ["attachments", taskId] });
        },
        onSettled: () => setProgress(null),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAttachment(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["attachments", taskId] });
            setToDelete(null);
        },
    });

    const handleFiles = (list: FileList | null) => {
        if (!list || list.length === 0 || uploadMutation.isPending) return;
        setErrors([]);
        uploadMutation.mutate(Array.from(list));
        if (inputRef.current) inputRef.current.value = "";
    };

    const closeDeleteModal = () => {
        setToDelete(null);
        deleteMutation.reset();
    };

    const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
    const documents = attachments.filter((a) => !a.mimeType.startsWith("image/"));

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className={labelClass}>Attachments</span>
                <span className="text-xs text-zinc-500">
                    {attachments.length}/{MAX_ATTACHMENTS_PER_TASK}
                </span>
            </div>

            {/* Drop zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                className={`cursor-pointer rounded-md border border-dashed px-3 py-4 text-center text-sm transition-colors ${
                    isDragging
                        ? "border-violet-500 bg-violet-500/10 text-zinc-200"
                        : "border-white/20 text-zinc-400 hover:border-white/40 hover:text-zinc-200"
                }`}
            >
                {progress ? (
                    <div className="flex flex-col gap-2">
                        <span className="truncate">Uploading {progress.name}… {progress.percent}%</span>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress.percent}%` }} />
                        </div>
                    </div>
                ) : (
                    <>Drop files here or click to upload<br /><span className="text-xs text-zinc-500">Images and PDFs, up to {formatBytes(MAX_ATTACHMENT_SIZE)}</span></>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                />
            </div>

            {errors.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-red-400">
                    {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
            )}

            {isLoading && <span className="text-xs text-zinc-500">Loading attachments…</span>}

            {/* Image thumbnails */}
            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {images.map((a) => (
                        <div key={a.id} className="group relative">
                            <a href={a.url} target="_blank" rel="noreferrer" title={a.filename}>
                                <img
                                    src={a.url}
                                    alt={a.filename}
                                    loading="lazy"
                                    className="aspect-square w-full rounded-md border border-white/10 object-cover"
                                />
                            </a>
                            {a.canDelete && (
                                <button
                                    type="button"
                                    onClick={() => setToDelete(a)}
                                    title="Delete"
                                    className="absolute right-1 top-1 hidden rounded bg-zinc-950/80 px-1.5 py-0.5 text-xs text-red-400 hover:bg-zinc-950 group-hover:block"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Other files */}
            {documents.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {documents.map((a) => (
                        <li
                            key={a.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-sm"
                        >
                            <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="min-w-0 flex-1 truncate text-zinc-200 hover:text-violet-400"
                                title={a.filename}
                            >
                                📄 {a.filename}
                            </a>
                            <span className="shrink-0 text-xs text-zinc-500">{formatBytes(a.size)}</span>
                            {a.canDelete && (
                                <button
                                    type="button"
                                    onClick={() => setToDelete(a)}
                                    title="Delete"
                                    className="shrink-0 rounded px-1.5 text-xs text-red-400 hover:bg-red-500/10"
                                >
                                    ✕
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmModal
                isOpen={!!toDelete}
                onClose={closeDeleteModal}
                onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
                title="Delete Attachment"
                message={<>Delete {toDelete?.filename}? This cannot be undone.</>}
                confirmLabel="Delete"
                pendingLabel="Deleting..."
                isPending={deleteMutation.isPending}
                error={deleteMutation.isError ? errorText(deleteMutation.error, "Failed to delete attachment.") : null}
            />
        </div>
    );
}