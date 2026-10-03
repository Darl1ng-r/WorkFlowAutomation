import { z } from "zod";

export const CreateObligationSchema = z.object({
  title: z.string().min(2).max(150),
  assetIdentifier: z.string().min(2).max(100),
  kind: z.enum([
    "INSURANCE",
    "VEHICLE_REGISTRATION",
    "BUILDING_REGISTRATION",
    "TRADE_LICENCE",
    "EQUIPMENT_PERMIT",
  ]),
  referenceNo: z.string().min(1).max(100),
  issuer: z.string().min(1).max(100),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expiration date must be YYYY-MM-DD"),
  leadDays: z.coerce.number().int().min(1).max(180).default(30),
  ownerEmail: z.string().email("Valid owner email required"),
});

export const QueryObligationsSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "RENEWED"]).optional(),
  expiringWithinDays: z.coerce.number().int().positive().optional(),
});

export type CreateObligationDTO = z.infer<typeof CreateObligationSchema>;
export type QueryObligationsDTO = z.infer<typeof QueryObligationsSchema>;
