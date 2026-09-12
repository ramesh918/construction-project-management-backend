import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const s3Config = {
  bucketName: () => requireEnv('BUCKET_NAME'),
};

export const s3Client = new S3Client({});

const UPLOAD_URL_TTL_SECONDS = 300; // 5 minutes — client must PUT the file within this window
const VIEW_URL_TTL_SECONDS = 900; // 15 minutes — enough to view/download in a browser tab

export function createUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: s3Config.bucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export function createViewUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3Config.bucketName(),
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: VIEW_URL_TTL_SECONDS });
}

export function deleteObject(key: string) {
  return s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.bucketName(),
      Key: key,
    }),
  );
}
