import { Injectable } from '@nestjs/common';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


@Injectable()
export class StorageService {
    private readonly bucket = process.env.S3_BUCKET!;
    private readonly client = new S3Client({
        region: process.env.S3_REGION ?? 'auto',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID!,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    });

    getUploadUrl(key: string, contentType: string, contentLength: number) {
        return getSignedUrl(
            this.client,
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
                ContentLength: contentLength,
            }),
            { expiresIn: 300 }, // 5 minutes to start the upload
        );
    }

    getDownloadUrl(key: string, filename: string, contentType: string) {
        return getSignedUrl(
            this.client,
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ResponseContentType: contentType,
                ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
            }),
            { expiresIn: 900 }, // 15 minutes
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

    async deleteMany(keys: string[]) {
        if (keys.length === 0) return;
        await this.client.send(
            new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: keys.map((Key) => ({ Key })) },
            }),
        );
    }        
}
