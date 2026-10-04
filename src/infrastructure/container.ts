import {
  ICorrespondenceRepository,
  IDocumentRepository,
  IInvoiceRepository,
  IApprovalRepository,
  IObligationRepository,
  IVisitorRepository,
  IAuditRepository,
  ISequenceRepository,
  ISupplyRepository,
  IRoomBookingRepository,
} from "@domain/repositories";
import {
  D1CorrespondenceRepository,
  D1DocumentRepository,
  D1InvoiceRepository,
  D1ApprovalRepository,
  D1ObligationRepository,
  D1VisitorRepository,
  D1AuditRepository,
  D1SequenceRepository,
  D1SupplyRepository,
  D1RoomBookingRepository,
} from "./db/d1-repositories";
import { RegisterCorrespondenceUseCase } from "@application/use-cases/register-correspondence.use-case";
import { ProcessInvoiceUseCase } from "@application/use-cases/process-invoice.use-case";
import { DecideApprovalUseCase } from "@application/use-cases/decide-approval.use-case";
import { VisitorCheckInUseCase } from "@application/use-cases/visitor-check-in.use-case";
import { CheckExpiringObligationsUseCase } from "@application/use-cases/check-expiring-obligations.use-case";
import { INotificationPort, IStoragePort, ICrmPort } from "@application/ports";
import { InMemoryCrmAdapter } from "./crm/hubspot-crm-adapter";

export interface ServiceContainer {
  correspondenceRepo: ICorrespondenceRepository;
  documentRepo: IDocumentRepository;
  invoiceRepo: IInvoiceRepository;
  approvalRepo: IApprovalRepository;
  obligationRepo: IObligationRepository;
  visitorRepo: IVisitorRepository;
  auditRepo: IAuditRepository;
  sequenceRepo: ISequenceRepository;
  supplyRepo: ISupplyRepository;
  roomBookingRepo: IRoomBookingRepository;
  db?: D1Database | undefined;
  storagePort?: IStoragePort | undefined;
  notificationPort?: INotificationPort | undefined;
  crmPort?: ICrmPort | undefined;

  // Use Cases
  registerCorrespondence: RegisterCorrespondenceUseCase;
  processInvoice: ProcessInvoiceUseCase;
  decideApproval: DecideApprovalUseCase;
  visitorCheckIn: VisitorCheckInUseCase;
  checkExpiringObligations: CheckExpiringObligationsUseCase;
}

/**
 * Creates a ServiceContainer from Cloudflare Workers Environment bindings.
 */
export function createContainerFromEnv(env: {
  DB: D1Database;
  VAULT?: R2Bucket;
  AI?: unknown;
}): ServiceContainer {
  const sequenceRepo = new D1SequenceRepository(env.DB);
  const correspondenceRepo = new D1CorrespondenceRepository(env.DB);
  const documentRepo = new D1DocumentRepository(env.DB);
  const invoiceRepo = new D1InvoiceRepository(env.DB);
  const approvalRepo = new D1ApprovalRepository(env.DB);
  const obligationRepo = new D1ObligationRepository(env.DB);
  const visitorRepo = new D1VisitorRepository(env.DB);
  const auditRepo = new D1AuditRepository(env.DB);
  const supplyRepo = new D1SupplyRepository(env.DB);
  const roomBookingRepo = new D1RoomBookingRepository(env.DB);

  let storagePort: IStoragePort | undefined;
  if (env.VAULT) {
    storagePort = {
      async putFile(key: string, data: Uint8Array, mimeType: string) {
        await env.VAULT!.put(key, data, {
          httpMetadata: { contentType: mimeType },
        });
        return { uri: `r2://${key}` };
      },
      async getFile(key: string) {
        const obj = await env.VAULT!.get(key);
        if (!obj) return null;
        const arrayBuf = await obj.arrayBuffer();
        return {
          data: new Uint8Array(arrayBuf),
          mimeType: obj.httpMetadata?.contentType ?? "application/octet-stream",
        };
      },
    };
  }

  // Use cases wiring
  const registerCorrespondence = new RegisterCorrespondenceUseCase(
    correspondenceRepo,
    sequenceRepo,
    documentRepo,
    auditRepo,
    storagePort
  );

  const processInvoice = new ProcessInvoiceUseCase(
    invoiceRepo,
    correspondenceRepo,
    approvalRepo,
    auditRepo
  );

  const decideApproval = new DecideApprovalUseCase(
    approvalRepo,
    invoiceRepo,
    correspondenceRepo,
    auditRepo,
    supplyRepo
  );

  const crmPort = new InMemoryCrmAdapter();
  const visitorCheckIn = new VisitorCheckInUseCase(visitorRepo, auditRepo, undefined, crmPort);

  const checkExpiringObligations = new CheckExpiringObligationsUseCase(
    obligationRepo,
    auditRepo
  );

  return {
    db: env.DB,
    correspondenceRepo,
    documentRepo,
    invoiceRepo,
    approvalRepo,
    obligationRepo,
    visitorRepo,
    auditRepo,
    sequenceRepo,
    supplyRepo,
    roomBookingRepo,
    storagePort,
    crmPort,
    registerCorrespondence,
    processInvoice,
    decideApproval,
    visitorCheckIn,
    checkExpiringObligations,
  };
}
