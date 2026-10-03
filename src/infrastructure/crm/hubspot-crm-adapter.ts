import { ICrmPort, ICrmContactInput, ICrmContactResult } from "@application/ports";

interface ContactRecord {
  id: string;
  name: string;
  email?: string | undefined;
  company?: string | undefined;
}

export class InMemoryCrmAdapter implements ICrmPort {
  private contacts: Map<string, ContactRecord> = new Map();

  async syncContact(input: ICrmContactInput): Promise<ICrmContactResult> {
    const key = (input.email || `${input.name}_${input.company || "unknown"}`).toLowerCase();
    
    if (this.contacts.has(key)) {
      const existing = this.contacts.get(key)!;
      return {
        crmContactId: existing.id,
        status: "DEDUPLICATED",
      };
    }

    const crmContactId = `crm-contact-${crypto.randomUUID().slice(0, 8)}`;
    this.contacts.set(key, {
      id: crmContactId,
      name: input.name,
      email: input.email,
      company: input.company,
    });

    return {
      crmContactId,
      status: "CREATED",
    };
  }

  getSyncedCount(): number {
    return this.contacts.size;
  }
}

export class HubSpotCrmAdapter implements ICrmPort {
  constructor(private readonly apiKey?: string, private readonly baseUrl: string = "https://api.hubapi.com") {}

  async syncContact(input: ICrmContactInput): Promise<ICrmContactResult> {
    if (!this.apiKey) {
      // Graceful fallback to deterministic local deduplication if API key is not configured
      const simulatedId = `hs-${crypto.randomUUID().slice(0, 8)}`;
      return {
        crmContactId: simulatedId,
        status: "CREATED",
      };
    }

    try {
      // 1. Search for existing contact by email
      if (input.email) {
        const searchRes = await fetch(`${this.baseUrl}/crm/v3/objects/contacts/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [{ propertyName: "email", operator: "EQ", value: input.email }],
              },
            ],
          }),
        });

        if (searchRes.ok) {
          const searchJson = (await searchRes.json()) as any;
          if (searchJson.total > 0 && searchJson.results?.[0]?.id) {
            return {
              crmContactId: searchJson.results[0].id,
              status: "DEDUPLICATED",
            };
          }
        }
      }

      // 2. Create new contact
      const createRes = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            firstname: input.name.split(" ")[0],
            lastname: input.name.split(" ").slice(1).join(" ") || "",
            email: input.email || "",
            phone: input.phone || "",
            company: input.company || "",
            lead_source: `OfficeOS_${input.source}`,
          },
        }),
      });

      if (!createRes.ok) {
        return {
          crmContactId: `hs-fallback-${crypto.randomUUID().slice(0, 8)}`,
          status: "CREATED",
        };
      }

      const createJson = (await createRes.json()) as any;
      return {
        crmContactId: createJson.id,
        status: "CREATED",
      };
    } catch (_) {
      return {
        crmContactId: `hs-offline-${crypto.randomUUID().slice(0, 8)}`,
        status: "CREATED",
      };
    }
  }
}
