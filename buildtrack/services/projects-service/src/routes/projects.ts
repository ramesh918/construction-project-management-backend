import { Hono } from 'hono';
import {
  PutItemCommand,
  GetItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoClient, dynamoConfig, projectKey, costSummaryKey } from '../lib/dynamo';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';
import { ok, fail } from '../lib/response';
import { AppError } from '../lib/errors';
import type { Project, ProjectCostSummary, PaginatedResponse } from '../../../../shared/types';

export const projectsRoute: Hono = new Hono();

projectsRoute.post('/', async c => {
  const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid project payload', 400);
  }

  const now = new Date().toISOString();
  const id = uuid();

  const project: Project = {
    id,
    ...parsed.data,
    status: 'Planning',
    documents: [],
    createdAt: now,
    updatedAt: now,
  };

  const costSummary: ProjectCostSummary = {
    projectId: id,
    labourCost: 0,
    materialCost: 0,
    otherCost: 0,
    totalCost: 0,
    budget: project.budget,
    remaining: project.budget,
    isOverBudget: false,
    updatedAt: now,
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: dynamoConfig.tableName(),
      Item: marshall({ ...projectKey(id), ...project }),
    }),
  );

  await dynamoClient.send(
    new PutItemCommand({
      TableName: dynamoConfig.tableName(),
      Item: marshall({ ...costSummaryKey(id), ...costSummary }),
    }),
  );

  return ok(c, project, 'Project created', 201);
});

projectsRoute.get('/:id', async c => {
  const id = c.req.param('id');

  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
    }),
  );

  if (!result.Item) {
    return fail(c, 'Project not found', 404);
  }

  return ok(c, unmarshall(result.Item) as Project);
});

projectsRoute.get('/', async c => {
  const statusFilter = c.req.query('status');
  const limit = Number(c.req.query('limit') ?? 20);
  const cursor = c.req.query('cursor');
  const exclusiveStartKey = cursor
    ? (JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>)
    : undefined;

  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: dynamoConfig.tableName(),
      FilterExpression: statusFilter ? 'SK = :sk AND #status = :status' : 'SK = :sk',
      ExpressionAttributeNames: statusFilter ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: marshall(
        statusFilter ? { ':sk': 'PROFILE', ':status': statusFilter } : { ':sk': 'PROFILE' },
      ),
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey as never,
    }),
  );

  const projects = (result.Items ?? []).map(item => unmarshall(item) as Project);
  const lastEvaluatedKey = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  const body: PaginatedResponse<Project> = {
    success: true,
    data: projects,
    count: projects.length,
    lastEvaluatedKey,
  };
  return c.json(body);
});

projectsRoute.patch('/:id', async c => {
  const id = c.req.param('id');
  const parsed = updateProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid update payload', 400);
  }

  const updates = { ...parsed.data, updatedAt: new Date().toISOString() };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses = Object.entries(updates).map(([field, value], i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = value;
    return `#f${i} = :v${i}`;
  });

  let result;
  try {
    result = await dynamoClient.send(
      new UpdateItemCommand({
        TableName: dynamoConfig.tableName(),
        Key: marshall(projectKey(id)),
        UpdateExpression: `SET ${setClauses.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: marshall(values),
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError(404, 'Project not found');
    }
    throw err;
  }

  if (parsed.data.budget !== undefined) {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: dynamoConfig.tableName(),
        Key: marshall(costSummaryKey(id)),
        UpdateExpression: 'SET budget = :budget, updatedAt = :now',
        ExpressionAttributeValues: marshall({
          ':budget': parsed.data.budget,
          ':now': updates.updatedAt,
        }),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  return ok(c, unmarshall(result.Attributes!) as Project, 'Project updated');
});
