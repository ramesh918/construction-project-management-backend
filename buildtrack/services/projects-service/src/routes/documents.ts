import { Hono } from 'hono';
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoClient, dynamoConfig, projectKey } from '../lib/dynamo';
import { createUploadUrl, createViewUrl, deleteObject } from '../lib/s3';
import { requestUploadUrlSchema, confirmUploadSchema } from '../schemas/document.schema';
import { ok, fail } from '../lib/response';
import { AppError } from '../lib/errors';
import type { Project, ProjectDocument } from '../../../../shared/types';

export const documentsRoute: Hono = new Hono();

function documentKeyPrefix(projectId: string): string {
  return `project-documents/${projectId}/`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function requireProject(id: string): Promise<Project> {
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
    }),
  );
  if (!result.Item) {
    throw new AppError(404, 'Project not found');
  }
  return unmarshall(result.Item) as Project;
}

documentsRoute.post('/:id/documents/upload-url', async c => {
  const id = c.req.param('id');
  const parsed = requestUploadUrlSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid upload request', 400);
  }

  await requireProject(id); // 404s if the project doesn't exist

  const { fileName, contentType, category } = parsed.data;
  const key = `${documentKeyPrefix(id)}${uuid()}-${sanitizeFileName(fileName)}`;
  const uploadUrl = await createUploadUrl(key, contentType);

  return ok(c, { uploadUrl, key, category, contentType, fileName });
});

documentsRoute.post('/:id/documents/confirm', async c => {
  const id = c.req.param('id');
  const parsed = confirmUploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid confirm payload', 400);
  }

  const { key, fileName, contentType, category } = parsed.data;

  if (!key.startsWith(documentKeyPrefix(id))) {
    return fail(c, 'Document key does not belong to this project', 400);
  }

  const project = await requireProject(id);
  const document: ProjectDocument = {
    key,
    fileName,
    category,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
  const documents = [...(project.documents ?? []), document];

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
      UpdateExpression: 'SET documents = :documents, updatedAt = :now',
      ExpressionAttributeValues: marshall({
        ':documents': documents,
        ':now': document.uploadedAt,
      }),
    }),
  );

  return ok(c, document, 'Document recorded', 201);
});

documentsRoute.get('/:id/documents', async c => {
  const id = c.req.param('id');
  const categoryFilter = c.req.query('category');

  const project = await requireProject(id);
  let documents = project.documents ?? [];

  if (categoryFilter) {
    documents = documents.filter(doc => doc.category === categoryFilter);
  }

  const withUrls = await Promise.all(
    documents.map(async doc => ({
      ...doc,
      viewUrl: await createViewUrl(doc.key),
    })),
  );

  return ok(c, withUrls);
});

documentsRoute.delete('/:id/documents/:key{.+}', async c => {
  const id = c.req.param('id');
  const key = c.req.param('key');

  if (!key.startsWith(documentKeyPrefix(id))) {
    return fail(c, 'Document key does not belong to this project', 400);
  }

  const project = await requireProject(id);
  const documents = project.documents ?? [];
  const remaining = documents.filter(doc => doc.key !== key);

  if (remaining.length === documents.length) {
    return fail(c, 'Document not found on this project', 404);
  }

  await deleteObject(key);

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
      UpdateExpression: 'SET documents = :documents, updatedAt = :now',
      ExpressionAttributeValues: marshall({
        ':documents': remaining,
        ':now': new Date().toISOString(),
      }),
    }),
  );

  return ok(c, null, 'Document deleted');
});
