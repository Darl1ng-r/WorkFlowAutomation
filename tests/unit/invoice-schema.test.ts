import { describe, it, expect } from "vitest";
import { InvoiceExtractionSchema } from "@schemas/invoice.schema";

describe("InvoiceExtractionSchema & Arithmetic Validation", () => {
  it("should validate a correct invoice extraction payload", () => {
    const validData = {
      vendorName: "Acme Office Supplies LLC",
      taxId: "300123456700003",
      invoiceNo: "INV-2026-9901",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      netAmount: 1000.0,
      taxAmount: 150.0,
      totalAmount: 1150.0,
      currency: "SAR",
      lineItems: [
        {
          description: "A4 Printing Paper Boxes (5x)",
          quantity: 5,
          unitPrice: 200,
          totalPrice: 1000,
        },
      ],
    };

    const parsed = InvoiceExtractionSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("should catch and reject invoice arithmetic mismatches (Net + Tax != Total)", () => {
    const invalidArithmeticData = {
      vendorName: "Fraudulent / Erroneous Vendor",
      invoiceNo: "INV-ERR-001",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      netAmount: 1000.0,
      taxAmount: 150.0,
      totalAmount: 1500.0, // Discrepancy! 1000 + 150 = 1150 != 1500
      currency: "SAR",
    };

    const parsed = InvoiceExtractionSchema.safeParse(invalidArithmeticData);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.includes("totalAmount"));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("Invoice arithmetic discrepancy");
    }
  });

  it("should tolerate minor rounding discrepancies within 0.05 margin", () => {
    const slightRoundingData = {
      vendorName: "Global Cloud Services",
      invoiceNo: "INV-ROUND-002",
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      netAmount: 99.99,
      taxAmount: 15.0, // 99.99 + 15.00 = 114.99
      totalAmount: 115.0, // Difference is 0.01 <= 0.05
      currency: "USD",
    };

    const parsed = InvoiceExtractionSchema.safeParse(slightRoundingData);
    expect(parsed.success).toBe(true);
  });
});
