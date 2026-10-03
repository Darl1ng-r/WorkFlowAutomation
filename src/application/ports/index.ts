import { DocumentType } from "@domain/types";
import { InvoiceExtractionDTO } from "@schemas/invoice.schema";

export interface INotificationPort {
  sendCard(options: {
    recipientEmail?: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    priority?: "NORMAL" | "HIGH" | "URGENT";
  }): Promise<void>;
}

export interface IStoragePort {
  putFile(key: string, data: Uint8Array, mimeType: string): Promise<{ uri: string }>;
  getFile(key: string): Promise<{ data: Uint8Array; mimeType: string } | null>;
}

export interface IAIExtractionPort {
  extractInvoice(textOrBuffer: string | Uint8Array): Promise<{
    extraction: InvoiceExtractionDTO;
    confidence: number;
    model: string;
  }>;
  classifyDocument(textOrSnippet: string): Promise<{
    docType: DocumentType;
    confidence: number;
    isRestricted: boolean;
  }>;
}

export interface ICrmContactInput {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  company?: string | undefined;
  source: "FRONT_DESK" | "CORRESPONDENCE" | "MANUAL";
}

export interface ICrmContactResult {
  crmContactId: string;
  status: "CREATED" | "UPDATED" | "DEDUPLICATED";
}

export interface ICrmPort {
  syncContact(contact: ICrmContactInput): Promise<ICrmContactResult>;
}
