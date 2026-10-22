import { Injectable, Logger } from '@nestjs/common';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly bucket = process.env.S3_BUCKET!;
    readonly client: S3Client; 
    private readonly signer: S3Client;

    constructor() {
        const config = {
            region: process.env.S3_REGION ?? 'auto',
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            },
            requestChecksumCalculation: 'WHEN_REQUIRED' as const,
            responseChecksumValidation: 'WHEN_REQUIRED' as const,
        };

        this.client = new S3Client({ ...config, endpoint: process.env.S3_ENDPOINT });
        this.signer = new S3Client({
            ...config,
            endpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT,
        });
    }

    getUploadUrl(key: string, contentType: string, contentLength: number) {
        return getSignedUrl(
            this.signer,
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
                ContentLength: contentLength,
            }),
            { expiresIn: 300 },
        );
    }

    getDownloadUrl(key: string, filename: string, contentType: string) {
        return getSignedUrl(
            this.signer,
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ResponseContentType: contentType,
                ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
            }),
            { expiresIn: 900 },
        );
    }

    async head(key: string): Promise<{ size: number } | null> {
        try {
            const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return { size: res.ContentLength ?? 0 };
        } catch (err: any) {
            if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
            throw err;
        }
    }

    async readHead(key: string, bytes = 4100): Promise<Buffer> {
        const res = await this.client.send(
            new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
        );
        return Buffer.from(await res.Body!.transformToByteArray());
    }

    async delete(key: string) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    /** Deletes in batches of 1000, the S3 limit per request. */
    async deleteMany(keys: string[]) {
        for (let i = 0; i < keys.length; i += 1000) {
            const chunk = keys.slice(i, i + 1000);
            const res = await this.client.send(
                new DeleteObjectsCommand({
                    Bucket: this.bucket,
                    Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
                }),
            );
            if (res.Errors?.length) {
                this.logger.warn(`${res.Errors.length} object(s) could not be deleted, the sweep will retry`);
            }
        }
    }

    /** For callers whose database work already succeeded: log failures instead of throwing. */
    async deleteManyQuietly(keys: string[]) {
        try {
            await this.deleteMany(keys);
        } catch (err) {
            this.logger.warn(`Failed to delete ${keys.length} object(s), the sweep will retry: ${err}`);
        }
    }
}
