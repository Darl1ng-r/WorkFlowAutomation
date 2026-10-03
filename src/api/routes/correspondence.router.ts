import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateCorrespondenceSchema, QueryCorrespondenceSchema } from "@schemas/correspondence.schema";
import { successResponse } from "../middleware/response-envelope";
import { NotFoundError } from "@domain/errors";
import { ServiceContainer } from "@infrastructure/container";

export function createCorrespondenceRouter(container: ServiceContainer) {
  const router = new Hono();

  // POST /api/correspondence - Register new item
  router.post("/", zValidator("json", CreateCorrespondenceSchema), async (c) => {
    const dto = c.req.valid("json");
    const user = c.get("user");

    const result = await container.registerCorrespondence.execute({
      dto,
      actorEmail: user.email,
    });

    return c.json(successResponse(result), 201);
  });

  // GET /api/correspondence - List items
  router.get("/", zValidator("query", QueryCorrespondenceSchema), async (c) => {
    const query = c.req.valid("query");
    const list = await container.correspondenceRepo.list(query);
    return c.json(successResponse(list));
  });

  // GET /api/correspondence/:id - Get detail with documents
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const item = await container.correspondenceRepo.findById(id);
    if (!item) {
      throw new NotFoundError("Correspondence", id);
    }
    const documents = await container.documentRepo.findByCorrespondenceId(id);
    return c.json(successResponse({ correspondence: item, documents }));
  });

  return router;
}
