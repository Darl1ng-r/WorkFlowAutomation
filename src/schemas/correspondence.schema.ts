import { z } from "zod";

export const CreateCorrespondenceSchema = z.object({
  direction: z.enum(["IN", "OUT"]).default("IN"),
  channel: z.enum(["EMAIL", "SCAN", "PHONE", "VISIT", "UPLOAD"]).default("UPLOAD"),
  subject: z.string().min(1, "Subject is required").max(255),
  sourceSender: z.string().max(255).optional(),
  recipient: z.string().max(255).optional(),
  organizationId: z.string().uuid().optional(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("INTERNAL"),
  physicalLocation: z.string().max(255).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid ISO Date (YYYY-MM-DD)")
    .optional(),
});

export const QueryCorrespondenceSchema = z.object({
  direction: z.enum(["IN", "OUT"]).optional(),
  status: z
    .enum(["RECEIVED", "EXTRACTED", "PENDING_APPROVAL", "APPROVED", "FILED", "REJECTED"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateCorrespondenceDTO = z.infer<typeof CreateCorrespondenceSchema>;
export type QueryCorrespondenceDTO = z.infer<typeof QueryCorrespondenceSchema>;
