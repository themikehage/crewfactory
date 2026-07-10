import { describe, expect, it } from "bun:test";
import { FACTORY_CONTRACTS } from "../core/tools/factory-contracts";

describe("Factory Contracts Tests", () => {
  it("should have all required entities defined", () => {
    const expectedEntities = [
      "agents",
      "projects",
      "channels",
      "sessions",
      "env",
      "providers",
      "skills",
      "experiments",
    ];

    for (const entity of expectedEntities) {
      expect(FACTORY_CONTRACTS[entity]).toBeDefined();
      expect(FACTORY_CONTRACTS[entity].entity).toBe(entity);
      expect(FACTORY_CONTRACTS[entity].description).toBeTypeOf("string");
      expect(FACTORY_CONTRACTS[entity].actions).toBeTypeOf("object");
    }
  });

  it("should have standard actions (get, upsert, delete) for all entities", () => {
    for (const contract of Object.values(FACTORY_CONTRACTS)) {
      expect(contract.actions.get).toBeTypeOf("object");
      expect(contract.actions.upsert).toBeTypeOf("object");
      expect(contract.actions.delete).toBeTypeOf("object");

      expect(contract.actions.get.description).toBeTypeOf("string");
      expect(contract.actions.upsert.description).toBeTypeOf("string");
      expect(contract.actions.delete.description).toBeTypeOf("string");

      expect(contract.actions.get.params).toBeTypeOf("object");
      expect(contract.actions.upsert.params).toBeTypeOf("object");
      expect(contract.actions.delete.params).toBeTypeOf("object");
    }
  });

  it("should define key fields for key contracts", () => {
    // Agents
    const agentsUpsert = FACTORY_CONTRACTS.agents.actions.upsert.params;
    expect(agentsUpsert.id.required).toBe(true);
    expect(agentsUpsert.name.required).toBe(true);
    expect(agentsUpsert.role.required).toBe(true);

    // Env
    const envUpsert = FACTORY_CONTRACTS.env.actions.upsert.params;
    expect(envUpsert.key.required).toBe(true);
    expect(envUpsert.value.required).toBe(true);

    // Providers
    const providersUpsert = FACTORY_CONTRACTS.providers.actions.upsert.params;
    expect(providersUpsert.id.required).toBe(true);
    expect(providersUpsert.apiKey.required).toBe(true);
  });
});
