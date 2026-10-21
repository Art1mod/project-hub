import axios from "axios";
import { api } from "../lib/api";

export interface Attachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    createdAt: string;
    uploader: { id: string; email: string } | null;
    canDelete: boolean;
    url: string;
}

export const getAttachments = async (taskId: string): Promise<Attachment[]> => {
    const { data } = await api.get<Attachment[]>(`/tasks/${taskId}/attachments`);
    return data;
};

export const uploadAttachment = async (
    taskId: string,
    file: File,
    onProgress?: (percent: number) => void,
): Promise<Attachment> => {
    const { data: target } = await api.post<{ uploadUrl: string; storageKey: string }>(
        `/tasks/${taskId}/attachments/upload-url`,
        { filename: file.name, mimeType: file.type, size: file.size },
    );

    await axios.put(target.uploadUrl, file, {
        headers: { "Content-Type": file.type },
        onUploadProgress: (e) => {
            if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        },
    });

    const { data } = await api.post<Attachment>(`/tasks/${taskId}/attachments`, {
        storageKey: target.storageKey,
        filename: file.name,
    });
    return data;
};

export const deleteAttachment = async (attachmentId: string): Promise<void> => {
    await api.delete(`/attachments/${attachmentId}`);
};