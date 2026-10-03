import { IVisitorRepository, IAuditRepository } from "@domain/repositories";
import { INotificationPort } from "@application/ports";
import { VisitorEntity } from "@domain/types";
import { VisitorCheckInDTO } from "@schemas/visitor.schema";
import { calculateSha256Hex } from "./register-correspondence.use-case";

export interface VisitorCheckInInput {
  dto: VisitorCheckInDTO;
}

export class VisitorCheckInUseCase {
  constructor(
    private readonly visitorRepo: IVisitorRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly notificationPort?: INotificationPort
  ) {}

  public async execute(input: VisitorCheckInInput): Promise<VisitorEntity> {
    const { dto } = input;
    const nowIso = new Date().toISOString();
    const visitorId = crypto.randomUUID();

    // Generate readable badge number (e.g., V-8472)
    const randomBadgeSeq = Math.floor(1000 + Math.random() * 9000);
    const badgeNumber = `V-${randomBadgeSeq}`;

    const visitor: VisitorEntity = {
      id: visitorId,
      fullName: dto.fullName,
      company: dto.company,
      email: dto.email,
      phone: dto.phone,
      hostEmployeeEmail: dto.hostEmployeeEmail,
      purpose: dto.purpose,
      badgeNumber,
      ndaSigned: dto.ndaSigned,
      checkedInAt: nowIso,
      createdAt: nowIso,
    };

    const savedVisitor = await this.visitorRepo.createCheckIn(visitor);

    // Notify Host Employee instantly
    if (this.notificationPort) {
      await this.notificationPort.sendCard({
        recipientEmail: dto.hostEmployeeEmail,
        title: `Visitor Arrived: ${dto.fullName}`,
        message: `${dto.fullName} ${dto.company ? `from ${dto.company}` : ""} has arrived at the front desk to see you (Purpose: ${dto.purpose}). Badge #${badgeNumber}.`,
        priority: "HIGH",
      });
    }

    // Audit log
    const payloadHash = await calculateSha256Hex(
      new TextEncoder().encode(JSON.stringify({ visitorId, name: dto.fullName, badge: badgeNumber }))
    );

    await this.auditRepo.append({
      actorEmail: "kiosk@frontdesk.local",
      actorType: "SYSTEM",
      action: "VISITOR_CHECKED_IN",
      entityType: "VISITOR",
      entityId: visitorId,
      payloadHash,
      occurredAt: nowIso,
    });

    return savedVisitor;
  }
}
