import { z } from "zod";

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "MODIFIED", "REJECTED"]),
  decidedByEmail: z.string().email("Valid approver email required"),
  humanDiff: z.record(z.unknown()).optional(),
  notes: z.string().max(500).optional(),
});

export type ApprovalDecisionDTO = z.infer<typeof ApprovalDecisionSchema>;
