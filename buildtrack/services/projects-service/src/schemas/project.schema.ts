import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format YYYY-MM-DD');

export const createProjectSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  budget: z.number().positive(),
  description: z.string().optional(),
});
export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(['Planning', 'Active', 'On Hold', 'Completed']).optional(),
    endDate: isoDate.optional(),
    budget: z.number().positive().optional(),
    description: z.string().optional(),
  })
  .refine(body => Object.keys(body).length > 0, { message: 'At least one field is required' });
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
