import { Hono } from 'hono';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { dynamoClient, dynamoConfig, costSummaryKey } from '../lib/dynamo';
import { ok, fail } from '../lib/response';
import type { ProjectCostSummary } from '../../../../shared/types';

export const costSummaryRoute: Hono = new Hono();

costSummaryRoute.get('/:id/cost-summary', async c => {
  const id = c.req.param('id');

  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(costSummaryKey(id)),
    }),
  );

  if (!result.Item) {
    return fail(c, 'Cost summary not found for this project', 404);
  }

  const stored = unmarshall(result.Item) as ProjectCostSummary;
  const totalCost = stored.labourCost + stored.materialCost + stored.otherCost;

  const summary: ProjectCostSummary = {
    ...stored,
    totalCost,
    remaining: stored.budget - totalCost,
    isOverBudget: totalCost > stored.budget,
  };

  return ok(c, summary);
});
