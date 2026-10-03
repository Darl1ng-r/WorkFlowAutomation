import { z } from "zod";

export const InvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
});

export const InvoiceCategorySchema = z
  .enum([
    "UTILITY_ELECTRICITY",
    "UTILITY_WATER",
    "OFFICE_RENT",
    "TELECOM",
    "SUBSCRIPTION",
    "GENERAL_SUPPLIES",
    "PROFESSIONAL_SERVICES",
    "OTHER",
  ])
  .default("OTHER");

export const InvoiceExtractionSchema = z
  .object({
    vendorName: z.string().min(1, "Vendor name is required"),
    taxId: z.string().optional(),
    invoiceNo: z.string().min(1, "Invoice number is required"),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date must be YYYY-MM-DD"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
    netAmount: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    totalAmount: z.number().positive(),
    currency: z.string().min(3).max(5).default("SAR"),
    category: InvoiceCategorySchema.optional(),
    lineItems: z.array(InvoiceLineItemSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Arithmetic validation check: net + tax ≈ total
    const computedTotal = Math.round((data.netAmount + data.taxAmount) * 100) / 100;
    const providedTotal = Math.round(data.totalAmount * 100) / 100;
    const diff = Math.abs(computedTotal - providedTotal);

    // Allow 0.05 threshold for currency roundings
    if (diff > 0.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invoice arithmetic discrepancy: Net (${data.netAmount}) + Tax (${data.taxAmount}) = ${computedTotal}, but Total provided is ${data.totalAmount}.`,
        path: ["totalAmount"],
      });
    }
  });

export const CreateInvoiceDTO = z.object({
  correspondenceId: z.string().uuid(),
  documentId: z.string().uuid(),
  vendorName: z.string().min(1),
  taxId: z.string().optional(),
  invoiceNo: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  netAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  totalAmount: z.number().positive(),
  currency: z.string().default("SAR"),
});

export type InvoiceExtractionDTO = z.infer<typeof InvoiceExtractionSchema>;
export type CreateInvoiceDTOType = z.infer<typeof CreateInvoiceDTO>;
