import {
  ICorrespondenceRepository,
  IDocumentRepository,
  ISequenceRepository,
  IAuditRepository,
} from "@domain/repositories";
import { IStoragePort } from "@application/ports";
import { CorrespondenceEntity, DocumentEntity } from "@domain/types";
import { ReferenceNumber } from "@domain/reference-number";
import { DuplicateEntityError, ValidationError } from "@domain/errors";
import { CreateCorrespondenceDTO } from "@schemas/correspondence.schema";

export interface RegisterCorrespondenceInput {
  dto: CreateCorrespondenceDTO;
  actorEmail: string;
  fileAttachment?: {
    name: string;
    data: Uint8Array;
    mimeType: string;
  };
}

export interface RegisterCorrespondenceOutput {
  correspondence: CorrespondenceEntity;
  document?: DocumentEntity | undefined;
  referenceNumber: string;
}

/**
 * Utility to calculate SHA-256 hash using standard Web Crypto API.
 */
export async function calculateSha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class RegisterCorrespondenceUseCase {
  constructor(
    private readonly correspondenceRepo: ICorrespondenceRepository,
    private readonly sequenceRepo: ISequenceRepository,
    private readonly documentRepo: IDocumentRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly storagePort?: IStoragePort
  ) {}

  public async execute(input: RegisterCorrespondenceInput): Promise<RegisterCorrespondenceOutput> {
    const { dto, actorEmail, fileAttachment } = input;
    const currentYear = new Date().getFullYear();

    // 1. Generate next atomic sequence number & ReferenceNumber Value Object
    const sequence = await this.sequenceRepo.getNextSequence(dto.direction, currentYear);
    const referenceNumber = ReferenceNumber.create(dto.direction, currentYear, sequence);

    // 2. Handle Document Attachment & Duplicate Check
    let sha256Hex: string | undefined;
    if (fileAttachment) {
      if (fileAttachment.data.byteLength === 0) {
        throw new ValidationError("Attached file is empty (0 bytes).");
      }
      sha256Hex = await calculateSha256Hex(fileAttachment.data);

      const existingDoc = await this.documentRepo.findBySha256(sha256Hex);
      if (existingDoc) {
        throw new DuplicateEntityError(
          "Document",
          "SHA-256 hash",
          sha256Hex
        );
      }
    }

    const nowIso = new Date().toISOString();
    const correspondenceId = crypto.randomUUID();

    // 3. Create Correspondence Entity
    const correspondence: CorrespondenceEntity = {
      id: correspondenceId,
      refNo: referenceNumber.toString(),
      direction: dto.direction,
      channel: dto.channel,
      subject: dto.subject,
      sourceSender: dto.sourceSender,
      recipient: dto.recipient,
      organizationId: dto.organizationId,
      ownerUserId: undefined,
      status: "RECEIVED",
      classification: dto.classification,
      physicalLocation: dto.physicalLocation,
      dueDate: dto.dueDate,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const savedCorrespondence = await this.correspondenceRepo.create(correspondence);

    // 4. Save Document & Vault record if file attached
    let savedDocument: DocumentEntity | undefined;
    if (fileAttachment && sha256Hex) {
      let vaultUri = `vault://${currentYear}/${referenceNumber.toString()}/${fileAttachment.name}`;
      if (this.storagePort) {
        const storageResult = await this.storagePort.putFile(
          `${currentYear}/${sha256Hex}_${fileAttachment.name}`,
          fileAttachment.data,
          fileAttachment.mimeType
        );
        vaultUri = storageResult.uri;
      }

      const documentEntity: DocumentEntity = {
        id: crypto.randomUUID(),
        correspondenceId: savedCorrespondence.id,
        sha256: sha256Hex,
        vaultUri,
        fileName: fileAttachment.name,
        fileSizeBytes: fileAttachment.data.byteLength,
        mimeType: fileAttachment.mimeType,
        classification: dto.classification,
        createdAt: nowIso,
      };

      savedDocument = await this.documentRepo.create(documentEntity);
    }

    // 5. Append Hash-Chained Audit Trail
    await this.auditRepo.append({
      actorEmail,
      actorType: "USER",
      action: "CORRESPONDENCE_REGISTERED",
      entityType: "CORRESPONDENCE",
      entityId: savedCorrespondence.id,
      payloadHash: sha256Hex ?? (await calculateSha256Hex(new TextEncoder().encode(JSON.stringify(dto)))),
      occurredAt: nowIso,
    });

    return {
      correspondence: savedCorrespondence,
      document: savedDocument,
      referenceNumber: referenceNumber.toString(),
    };
  }
}
