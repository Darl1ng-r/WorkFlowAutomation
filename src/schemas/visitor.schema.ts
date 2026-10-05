import { z } from "zod";

export const VisitorCheckInSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(100),
  company: z.string().max(100).optional(),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().min(7, "Valid phone number required").max(20).optional().or(z.literal("")),
  hostEmployeeEmail: z.string().email("Host employee email required"),
  purpose: z.string().min(2, "Purpose of visit required").max(200),
  ndaSigned: z.boolean().default(false),
});

export const VisitorCheckOutSchema = z.object({
  visitorId: z.string().uuid("Valid visitor ID required"),
});

export const VisitorAIParseSchema = z.object({
  notes: z.string().min(5, "Visitor notes or transcript required"),
  autoCheckIn: z.boolean().optional().default(false),
});

export type VisitorCheckInDTO = z.infer<typeof VisitorCheckInSchema>;
export type VisitorCheckOutDTO = z.infer<typeof VisitorCheckOutSchema>;
export type VisitorAIParseDTO = z.infer<typeof VisitorAIParseSchema>;

