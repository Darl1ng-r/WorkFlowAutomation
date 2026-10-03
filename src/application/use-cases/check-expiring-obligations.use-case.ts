import { IObligationRepository, IAuditRepository } from "@domain/repositories";
import { INotificationPort } from "@application/ports";
import { ObligationEntity } from "@domain/types";

export interface CheckExpiringObligationsResult {
  totalChecked: number;
  expiringCount: number;
  expiringObligations: ObligationEntity[];
}

export class CheckExpiringObligationsUseCase {
  constructor(
    private readonly obligationRepo: IObligationRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly notificationPort?: INotificationPort
  ) {}

  public async execute(daysThreshold = 30): Promise<CheckExpiringObligationsResult> {
    const expiring = await this.obligationRepo.findExpiring(daysThreshold);
    const nowIso = new Date().toISOString();

    for (const item of expiring) {
      // Update status to EXPIRING_SOON if it's currently ACTIVE
      if (item.status === "ACTIVE") {
        await this.obligationRepo.updateStatus(item.id, "EXPIRING_SOON", nowIso);
      }

      // Notify owner
      if (this.notificationPort) {
        await this.notificationPort.sendCard({
          recipientEmail: item.ownerEmail,
          title: `Upcoming Expiry: ${item.title}`,
          message: `${item.kind} for ${item.assetIdentifier} (Ref: ${item.referenceNo}) expires on ${item.expiresOn}. Please initiate renewal.`,
          priority: "HIGH",
        });
      }
    }

    if (expiring.length > 0) {
      await this.auditRepo.append({
        actorEmail: "system:cron",
        actorType: "SYSTEM",
        action: "OBLIGATIONS_EXPIRY_CHECKED",
        entityType: "OBLIGATION",
        entityId: "batch",
        payloadHash: "0000000000000000000000000000000000000000000000000000000000000000",
        occurredAt: nowIso,
      });
    }

    return {
      totalChecked: expiring.length,
      expiringCount: expiring.length,
      expiringObligations: expiring,
    };
  }
}
