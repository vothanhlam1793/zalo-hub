import { Client } from 'minio';
import { createReadStream } from 'node:fs';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export interface ComposerObjects {
  put(key: string, path: string, size: number): Promise<void>;
  read(key: string, size: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

/** Separate PRIVATE bucket: existing media bucket may have anonymous download policy. */
export class ComposerObjectStore implements ComposerObjects {
  private client?: Client;
  private ready?: Promise<void>;
  private readonly bucket = process.env.MINIO_STAGING_BUCKET || 'zalohub-composer-staging';
  private async getClient() {
    this.client ??= new Client({ endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1', port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true', accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_USER || 'zalohub',
      secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_PASSWORD || 'zalohub-minio-secret' });
    this.client.setRequestOptions({ agent: process.env.MINIO_USE_SSL === 'true'
      ? new HttpsAgent({ timeout: 120_000 }) : new HttpAgent({ timeout: 120_000 }) });
    this.ready ??= (async () => {
      if (!await this.client!.bucketExists(this.bucket)) {
        try { await this.client!.makeBucket(this.bucket); }
        catch (e) { if (!await this.client!.bucketExists(this.bucket)) throw e; }
      }
      // Fail closed if an operator accidentally selected a public bucket.
      const policy = await this.client!.getBucketPolicy(this.bucket).catch((e: { code?: string }) => {
        if (e.code === 'NoSuchBucketPolicy') return '';
        throw e;
      });
      if (policy) throw new Error('Staging bucket must have no public bucket policy');
    })().catch(e => { this.ready = undefined; throw e; });
    await this.ready;
    return this.client;
  }
  async put(key: string, path: string, size: number) {
    const client = await this.getClient();
    const stream = createReadStream(path);
    try { await client.putObject(this.bucket, key, stream, size, { 'Content-Type': 'application/octet-stream' }); }
    finally { stream.destroy(); }
  }
  async read(key: string, size: number) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) throw new Error('Invalid staged size');
    const stream = await (await this.getClient()).getObject(this.bucket, key);
    // A single allocation, not chunks + Buffer.concat (which doubles peak memory).
    const result = Buffer.allocUnsafe(size);
    let offset = 0;
    const timer = setTimeout(() => stream.destroy(new Error('Staging read timeout')), 120_000);
    try {
      for await (const chunk of stream) {
        if (offset + chunk.length > size) throw new Error('Staged object grew');
        result.set(chunk, offset); offset += chunk.length;
      }
      if (offset !== size) throw new Error('Staged object truncated');
      return result;
    } finally { clearTimeout(timer); stream.destroy(); }
  }
  async remove(key: string) { await (await this.getClient()).removeObject(this.bucket, key); }
}
