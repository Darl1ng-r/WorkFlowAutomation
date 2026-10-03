import { AutonomyLevel, DataClassification } from "@domain/types";
import { PolicyViolationError } from "@domain/errors";

export interface AutonomyRuleContext {
  actionType:
    | "INBOUND_REGISTRATION"
    | "INVOICE_EXTRACTION"
    | "PAYMENT_EXECUTION"
    | "OUTBOUND_CORRESPONDENCE"
    | "VISITOR_CHECK_IN"
    | "RENEWAL_REMINDER"
    | "RESTRICTED_ROUTING";
  classification?: DataClassification | undefined;
  confidenceScore?: number | undefined;
  recentErrorRate?: number | undefined;
}

/**
 * AutonomyPolicyEngine
 * Enforces the strict L0-L3 governance rules defined in the architecture plan.
 */
export class AutonomyPolicyEngine {
  /**
   * Evaluates the appropriate autonomy level for a given action and context.
   */
  public static evaluate(context: AutonomyRuleContext): AutonomyLevel {
    // Rule 1: Financial payment execution is permanently L0 (Human Only)
    if (context.actionType === "PAYMENT_EXECUTION") {
      return "L0";
    }

    // Rule 2: Any communication leaving the office is permanently L2 (Mandatory Human Sign-off)
    if (context.actionType === "OUTBOUND_CORRESPONDENCE") {
      return "L2";
    }

    // Rule 3: Restricted documents (contracts, legal claims) require human gatekeeping
    if (context.classification === "RESTRICTED") {
      return "L2";
    }

    // Rule 4: Circuit Breaker - Automatic Demotion
    // If the recent correction/error rate exceeds 10% (0.10), drop from L3 to L2
    if (context.recentErrorRate !== undefined && context.recentErrorRate > 0.1) {
      return "L2";
    }

    // Rule 5: Standard document intake and front desk visitor check-in
    if (context.actionType === "INBOUND_REGISTRATION" || context.actionType === "VISITOR_CHECK_IN") {
      return "L3";
    }

    // Rule 6: Internal renewal reminders and escalations
    if (context.actionType === "RENEWAL_REMINDER") {
      return "L3";
    }

    // Rule 7: Invoice extraction default is L2 (unless promoted after 200 runs with < 2% error)
    if (context.actionType === "INVOICE_EXTRACTION") {
      if (
        context.confidenceScore !== undefined &&
        context.confidenceScore >= 0.98 &&
        context.recentErrorRate !== undefined &&
        context.recentErrorRate < 0.02
      ) {
        return "L3";
      }
      return "L2";
    }

    return "L2";
  }

  /**
   * Asserts that an automated agent is allowed to execute the given action.
   * Throws PolicyViolationError if an agent attempts an L0 or L2 action without human approval.
   */
  public static assertCanExecuteAutonomous(level: AutonomyLevel, actionName: string): void {
    if (level === "L0") {
      throw new PolicyViolationError(
        `Action '${actionName}' is classified as L0 (Human-Only). Automated agent execution is strictly prohibited.`
      );
    }
    if (level === "L1" || level === "L2") {
      throw new PolicyViolationError(
        `Action '${actionName}' is classified as ${level} and requires explicit human verification/approval.`
      );
    }
  }
}
