import { z } from 'zod';

const documentCategory = z.enum(['blueprint', 'permit', 'contract', 'other']);

export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  category: documentCategory,
});
export type RequestUploadUrlBody = z.infer<typeof requestUploadUrlSchema>;

export const confirmUploadSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  category: documentCategory,
});
export type ConfirmUploadBody = z.infer<typeof confirmUploadSchema>;
