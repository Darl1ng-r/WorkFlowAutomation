import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { ServiceContainer } from "@infrastructure/container";
import { SupplyItemEntity } from "@domain/types";
import { successResponse } from "../middleware/response-envelope";

const defaultSuppliesFallback: SupplyItemEntity[] = [
  {
    id: "sup-001",
    name: "A4 High-White Copy Paper (80gsm)",
    category: "PRINTING",
    currentStock: 6,
    parLevel: 4,
    unit: "Cartons (5 reams)",
    supplier: "Office Depot Saudi",
    unitPrice: 120,
    currency: "SAR",
    status: "OK",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sup-002",
    name: "Arabica Blend Espresso Whole Beans",
    category: "PANTRY",
    currentStock: 2,
    parLevel: 3,
    unit: "1kg Bags",
    supplier: "Specialty Bean Roasters",
    unitPrice: 95,
    currency: "SAR",
    status: "LOW_STOCK",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sup-003",
    name: "HP LaserJet Enterprise Black Toner (W9004MC)",
    category: "PRINTING",
    currentStock: 1,
    parLevel: 2,
    unit: "Cartridges",
    supplier: "Saudi Xerox & HP Solutions",
    unitPrice: 420,
    currency: "SAR",
    status: "LOW_STOCK",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sup-004",
    name: "Anker USB-C Multiport 7-in-1 Hub",
    category: "IT_ACCESSORY",
    currentStock: 4,
    parLevel: 2,
    unit: "Units",
    supplier: "Jarir Bookstore Corporate",
    unitPrice: 185,
    currency: "SAR",
    status: "OK",
    updatedAt: new Date().toISOString(),
  },
];

export function createSuppliesRouter(container: ServiceContainer): Hono {
  const router = new Hono();

  // Helper to get supplies list from repository or fallback
  async function getSupplies(): Promise<SupplyItemEntity[]> {
    if (container.supplyRepo) {
      const list = await container.supplyRepo.list();
      if (list.length > 0) return list;
    }
    return defaultSuppliesFallback;
  }

  // GET /api/supplies - List inventory with par-level statuses
  router.get("/", async (c) => {
    const list = await getSupplies();
    return c.json(successResponse(list));
  });

  // POST /api/supplies/:id/consume - Record usage, idempotent auto-reorder if <= par-level
  router.post(
    "/:id/consume",
    zValidator("json", z.object({ quantity: z.number().int().positive().default(1) })),
    async (c) => {
      const id = c.req.param("id");
      const { quantity } = c.req.valid("json");

      let item: SupplyItemEntity | null = null;
      if (container.supplyRepo) {
        item = await container.supplyRepo.consume(id, quantity);
      } else {
        const found = defaultSuppliesFallback.find((s) => s.id === id);
        if (found) {
          found.currentStock = Math.max(0, found.currentStock - quantity);
          found.status = found.currentStock <= found.parLevel ? "LOW_STOCK" : "OK";
          found.updatedAt = new Date().toISOString();
          item = found;
        }
      }

      if (!item) {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: "Supply item not found" } }, 404);
      }

      let reorderTriggered = false;

      // If current stock drops to or below par level, trigger reorder approval idempotently
      if (item.currentStock <= item.parLevel) {
        // IDEMPOTENCY GUARD (A-4): Check if an approval is already pending for this supply
        const existingApproval = await container.approvalRepo.findPendingByTarget("SUPPLY_REORDER", item.id);

        if (!existingApproval) {
          const reorderQty = item.parLevel * 2;
          const totalEstimatedCost = reorderQty * item.unitPrice;
          const approvalId = crypto.randomUUID();

          await container.approvalRepo.create({
            id: approvalId,
            workflowRunId: `wf-reorder-${item.id}`,
            targetEntityType: "SUPPLY_REORDER",
            targetEntityId: item.id,
            proposedAction: `REORDER_${item.name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`,
            proposedPayload: {
              supplyId: item.id,
              name: item.name,
              currentStock: item.currentStock,
              parLevel: item.parLevel,
              recommendedReorderQty: reorderQty,
              supplier: item.supplier,
              estimatedTotal: totalEstimatedCost,
              currency: item.currency,
            },
            decision: "PENDING",
            createdAt: new Date().toISOString(),
          });

          if (container.notificationPort) {
            await container.notificationPort.sendCard({
              title: `[Supply Alert] Par-Level Reorder: ${item.name}`,
              message: `Stock is low (${item.currentStock} ${item.unit} remaining, par is ${item.parLevel}). Reorder of ${reorderQty} ${item.unit} (${totalEstimatedCost} ${item.currency}) queued for human review.`,
              actionLabel: "Approve Reorder",
              priority: "NORMAL",
            });
          }

          if (container.supplyRepo) {
            await container.supplyRepo.updateStatus(item.id, "REORDER_TRIGGERED");
          }
          item.status = "REORDER_TRIGGERED";
          reorderTriggered = true;
        } else {
          item.status = "REORDER_TRIGGERED";
        }
      }

      return c.json(
        successResponse({
          item,
          consumed: quantity,
          reorderTriggered,
        })
      );
    }
  );

  // POST /api/supplies/:id/reorder - Force manual reorder trigger (idempotent)
  router.post("/:id/reorder", async (c) => {
    const id = c.req.param("id");
    let item: SupplyItemEntity | null = null;

    if (container.supplyRepo) {
      item = await container.supplyRepo.findById(id);
    } else {
      item = defaultSuppliesFallback.find((s) => s.id === id) ?? null;
    }

    if (!item) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Supply item not found" } }, 404);
    }

    const existingApproval = await container.approvalRepo.findPendingByTarget("SUPPLY_REORDER", item.id);
    if (!existingApproval) {
      const reorderQty = item.parLevel * 2;
      const totalCost = reorderQty * item.unitPrice;

      await container.approvalRepo.create({
        id: crypto.randomUUID(),
        workflowRunId: `wf-reorder-manual-${item.id}`,
        targetEntityType: "SUPPLY_REORDER",
        targetEntityId: item.id,
        proposedAction: `MANUAL_REORDER_${item.name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`,
        proposedPayload: {
          supplyId: item.id,
          name: item.name,
          currentStock: item.currentStock,
          parLevel: item.parLevel,
          recommendedReorderQty: reorderQty,
          supplier: item.supplier,
          estimatedTotal: totalCost,
          currency: item.currency,
        },
        decision: "PENDING",
        createdAt: new Date().toISOString(),
      });

      if (container.supplyRepo) {
        await container.supplyRepo.updateStatus(item.id, "REORDER_TRIGGERED");
      }
      item.status = "REORDER_TRIGGERED";
    }

    return c.json(
      successResponse({
        message: `Reorder approval for ${item.name} active.`,
        item,
      })
    );
  });

  return router;
}
