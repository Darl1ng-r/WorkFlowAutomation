# Standard Operating Procedure (SOP) Template

> Every workflow automated in Office OS must have an SOP created before going live. Anyone in the office must be able to understand the process, execute human checkpoints, handle exceptions, and fall back to manual operations if systems are degraded.

---

## 1. Document Control & Metadata

| Field | Detail |
|---|---|
| **SOP ID** | `SOP-[MODULE]-[NUMBER]` (e.g., `SOP-FIN-001`) |
| **Workflow Title** | Descriptive title of the workflow |
| **Target System / Module** | Invoicing, Visitor Kiosk, Correspondence Register, Renewals, etc. |
| **Primary Owner (Human)** | Name, Role, Email (Must be a specific team member, not a shared box) |
| **Backup Owner (Human)** | Secondary person accountable when the primary owner is unavailable |
| **Effective Date** | YYYY-MM-DD |
| **Review Cadence** | Monthly / Quarterly |
| **Current Autonomy Level** | L0 / L1 / L2 / L3 (defined below) |
| **Data Classification** | Public / Internal / Confidential / Restricted |

---

## 2. Autonomy Classification

| Level | Classification | Meaning in this SOP |
|---|---|---|
| **L0** | Manual Only | Humans execute all actions. AI is strictly prohibited from touching this step. |
| **L1** | AI Suggested | AI drafts or recommends, but human takes the manual action. |
| **L2** | AI Prepared, Human Approved | AI prepares the record/draft; a designated human **must explicitly approve** before execution. |
| **L3** | Autonomous Execution | AI executes automatically; human performs weekly QA audits (sample rate ≥ 5%). |

---

## 3. Purpose & Business Objective
- **Problem Solved**: What manual pain point or delay does this workflow eliminate?
- **Key Outcome**: What is the target end state (e.g., invoice filed, draft bill created in accounting, vendor acknowledged)?
- **Baseline Metric**: How long did this process take manually before automation? (Feeds the hours-saved metric).

---

## 4. Trigger & Inbound Channels
- **Inbound Sources**: Email inbox (`accounts@company.com`), Drive scan folder, Webhook, Kiosk, or Manual Form.
- **Expected Frequency**: Daily volume, peak hours, expected batch sizes.
- **Pre-Conditions**: Required file formats (PDF, PNG, JPG), minimum scan resolution (300 DPI), required metadata.

---

## 5. End-to-End Operational Steps

| Step # | Action Description | Executed By (Agent / Human) | System Involved | Autonomy Level | Output / State Change |
|---|---|---|---|---|---|
| **1** | Ingestion & Verification | System / `agent:intake` | Cloudflare Worker / Drive | L3 | Hash calculated, duplicate check passed |
| **2** | Reference Tagging | System | D1 Registry | L3 | Ref assigned (e.g., `IN-2026-XXXX`) |
| **3** | Extraction & Anomaly Check | AI (`Workers AI` / `Claude`) | Workers AI | L2 | Structured JSON extraction & confidence score |
| **4** | Human Verification & Sign-off | **Human Approver** | Approval Inbox / Google Chat | **L2 Checkpoint** | Approved / Modified / Rejected |
| **5** | Downstream Sync & Filing | Worker | Accounting API + Drive | L3 | Draft bill created, file archived |

---

## 6. Human Checkpoints & Quality Verification Checklist
*What the human reviewer MUST inspect before pressing "Approve":*
- [ ] **Vendor Verification**: Does the vendor name match an approved entity?
- [ ] **Arithmetic Check**: Does Net Amount + Tax/VAT = Total Amount?
- [ ] **Currency Check**: Is currency properly identified (e.g., SAR, AED, USD, EUR)?
- [ ] **Classification Check**: Does this document contain Restricted clauses (contracts, claims, PII)?
- [ ] **Low-Confidence Highlights**: Have all fields highlighted in yellow/red been manually cross-referenced against the original document?

---

## 7. Exceptions, Edge Cases & Escalation

| Scenario / Failure Mode | Detection Signal | Immediate Action | Escalation Contact |
|---|---|---|---|
| **Duplicate Detected** | System flags identical invoice number or file hash | Pause processing; notify owner to inspect previous filing | Finance Lead |
| **Low OCR Confidence (< 80%)** | AI returns low confidence warning flag | Route to Manual Triage queue for manual keying | Front Desk / Admin |
| **Unknown Vendor** | Vendor Tax ID / Name not found in CRM / Accounting | Hold creation; trigger vendor onboarding task | Finance / Procurement |
| **Approval SLA Breach (> 24h)** | System alert in Google Chat `#ops-alerts` | Automated reminder to approver + notification to department head | Department Head |

---

## 8. Manual Fallback & Business Continuity (Disaster Recovery)
If the automated platform, Cloudflare Worker, or AI service is degraded or offline:
1. **Intake Continuity**: Physical mail and scans must be placed into the physical `INBOX-MANUAL` tray. Emails remain in the shared Gmail mailbox marked with label `Pending-Manual`.
2. **Manual Logging**: Log items manually into the backup Google Sheet (`Office_OS_Manual_Register_Backup`).
3. **Manual Numbering**: Reserve manual reference numbers using the prefix `MAN-IN-YYYY-XXXX`.
4. **Reconciliation**: Once systems are restored, run the reconciliation script to backfill manual entries into the primary D1/Postgres database.

---

## 9. Key Performance Indicators (KPIs) & Audit Schedule
- **Target Touch Time**: < 45 seconds per document review.
- **Target Accuracy**: ≥ 98% field accuracy after human check.
- **Target Cycle Time**: Ingestion to downstream sync in < 4 hours.
- **Weekly QA Audit**: Every Monday at 09:00, the Workflow Owner randomly inspects 5% of all L3-executed items.
- **Demotion Rule**: If human correction rate exceeds 10% across the last 50 runs, this workflow is automatically downgraded from L3 to L2.

---

## 10. Change Control & Revision History

| Version | Date | Author | Description of Change | Approved By |
|---|---|---|---|---|
| `1.0.0` | 2026-10-03 | Systems Lead | Initial baseline SOP | Operations Director |
