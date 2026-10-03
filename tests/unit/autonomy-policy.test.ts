import { describe, it, expect } from "vitest";
import { AutonomyPolicyEngine } from "@application/autonomy-policy";
import { PolicyViolationError } from "@domain/errors";

describe("AutonomyPolicyEngine & Governance Rules", () => {
  it("should enforce L0 (Human-Only) permanently for payment execution", () => {
    const level = AutonomyPolicyEngine.evaluate({
      actionType: "PAYMENT_EXECUTION",
    });
    expect(level).toBe("L0");

    expect(() =>
      AutonomyPolicyEngine.assertCanExecuteAutonomous(level, "Disburse vendor payment")
    ).toThrow(PolicyViolationError);
  });

  it("should enforce L2 permanently for all outbound office correspondence", () => {
    const level = AutonomyPolicyEngine.evaluate({
      actionType: "OUTBOUND_CORRESPONDENCE",
    });
    expect(level).toBe("L2");

    expect(() =>
      AutonomyPolicyEngine.assertCanExecuteAutonomous(level, "Send official email")
    ).toThrow(PolicyViolationError);
  });

  it("should enforce L2 for Restricted documents regardless of high confidence", () => {
    const level = AutonomyPolicyEngine.evaluate({
      actionType: "INBOUND_REGISTRATION",
      classification: "RESTRICTED",
      confidenceScore: 0.99,
    });
    expect(level).toBe("L2");
  });

  it("should evaluate standard inbound registration as L3 (Autonomous)", () => {
    const level = AutonomyPolicyEngine.evaluate({
      actionType: "INBOUND_REGISTRATION",
      classification: "INTERNAL",
    });
    expect(level).toBe("L3");
    // Should not throw
    expect(() =>
      AutonomyPolicyEngine.assertCanExecuteAutonomous(level, "Register inbound scan")
    ).not.toThrow();
  });

  it("should trigger Circuit Breaker: demote L3 to L2 if error rate exceeds 10%", () => {
    const level = AutonomyPolicyEngine.evaluate({
      actionType: "INBOUND_REGISTRATION",
      recentErrorRate: 0.12, // 12% errors over last 50 runs
    });
    expect(level).toBe("L2");
  });

  it("should default invoices to L2, but allow promotion to L3 with high confidence and < 2% error rate", () => {
    // Default invoice extraction
    const defaultLevel = AutonomyPolicyEngine.evaluate({
      actionType: "INVOICE_EXTRACTION",
      confidenceScore: 0.92,
    });
    expect(defaultLevel).toBe("L2");

    // Promoted invoice extraction (confidence >= 0.98 and error rate < 0.02)
    const promotedLevel = AutonomyPolicyEngine.evaluate({
      actionType: "INVOICE_EXTRACTION",
      confidenceScore: 0.99,
      recentErrorRate: 0.01,
    });
    expect(promotedLevel).toBe("L3");
  });
});
