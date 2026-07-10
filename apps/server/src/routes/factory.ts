import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { FACTORY_CONTRACTS } from "../core/tools/factory-contracts";

export const factoryRouter = new Hono();

factoryRouter.use("/*", authMiddleware);

factoryRouter.get("/contract/:entity", (c) => {
  const entity = c.req.param("entity");
  const contract = FACTORY_CONTRACTS[entity];
  if (!contract) {
    return c.json({ error: `Unknown entity: ${entity}. Available: ${Object.keys(FACTORY_CONTRACTS).join(", ")}` }, 404);
  }
  return c.json(contract);
});

factoryRouter.get("/contracts", (c) => {
  const summaries = Object.entries(FACTORY_CONTRACTS).map(([entity, contract]) => ({
    entity,
    description: contract.description,
    actions: Object.keys(contract.actions),
  }));
  return c.json({ entities: summaries });
});
