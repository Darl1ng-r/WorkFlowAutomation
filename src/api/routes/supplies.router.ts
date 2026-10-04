import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { ServiceContainer } from "@infrastructure/container";
import { SupplyItemEntity } from "@domain/types";
import { successResponse } from "../middleware/response-envelope";

const defaultSupplies: SupplyItemEntity[] = [
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

// In-memory state with initial seed
const suppliesState = new Map<string, SupplyItemEntity>(
  defaultSupplies.map((s) => [s.id, { ...s }])
);

export function createSuppliesRouter(container: ServiceContainer): Hono {
  const router = new Hono();

  // GET /api/supplies - List inventory with par-level statuses
  router.get("/", (c) => {
    const list = Array.from(suppliesState.values());
    return c.json(successResponse(list));
  });

  // POST /api/supplies/:id/consume - Record usage, auto-triggering reorder if <= par-level
  router.post(
    "/:id/consume",
    zValidator("json", z.object({ quantity: z.number().int().positive().default(1) })),
    async (c) => {
      const id = c.req.param("id");
      const { quantity } = c.req.valid("json");
      const item = suppliesState.get(id);

      if (!item) {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: "Supply item not found" } }, 404);
      }

      item.currentStock = Math.max(0, item.currentStock - quantity);
      item.updatedAt = new Date().toISOString();

      let reorderTriggered = false;

      // If current stock drops to or below par level, automatically summon L2 reorder approval
      if (item.currentStock <= item.parLevel) {
        item.status = "LOW_STOCK";
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
          decision: "APPROVED",
          createdAt: new Date().toISOString(),
        });

        if (container.notificationPort) {
          await container.notificationPort.sendCard({
            title: `⚠️ Supply Par-Level Reorder: ${item.name}`,
            message: `Stock is low (${item.currentStock} ${item.unit} remaining, par is ${item.parLevel}). One-click reorder of ${reorderQty} ${item.unit} (${totalEstimatedCost} ${item.currency}) prepared for approval.`,
            actionLabel: "Approve Reorder",
            priority: "NORMAL",
          });
        }

        item.status = "REORDER_TRIGGERED";
        reorderTriggered = true;
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

  // POST /api/supplies/:id/reorder - Force manual reorder trigger
  router.post("/:id/reorder", async (c) => {
    const id = c.req.param("id");
    const item = suppliesState.get(id);

    if (!item) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Supply item not found" } }, 404);
    }

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
      decision: "APPROVED",
      createdAt: new Date().toISOString(),
    });

    item.status = "REORDER_TRIGGERED";

    return c.json(
      successResponse({
        reordered: true,
        item,
        recommendedReorderQty: reorderQty,
        estimatedTotal: totalCost,
      })
    );
  });

  return router;
}
