import { z } from "zod";

export const CallLogCreateSchema = z.object({
  callerNumber: z.string().min(3, "Caller number is required").max(30),
  callerName: z.string().max(100).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).default("INBOUND"),
  routedToUserEmail: z.string().email("Valid staff email required"),
  summary: z.string().min(5, "Summary must be at least 5 characters").max(500),
  durationSeconds: z.number().int().min(0).default(0),
  pbxCallId: z.string().max(100).optional(),
});

export const CallLogAIProcessSchema = z.object({
  notes: z.string().min(5, "Call notes or transcript required"),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional().default("INBOUND"),
  defaultStaffEmail: z.string().email().optional().default("reception@company.com"),
});

export type CallLogCreateDTO = z.infer<typeof CallLogCreateSchema>;
export type CallLogAIProcessDTO = z.infer<typeof CallLogAIProcessSchema>;
