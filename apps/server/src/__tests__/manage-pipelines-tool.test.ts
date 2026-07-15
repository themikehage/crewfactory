import { mock, describe, it, expect, beforeEach } from "bun:test";

const mockBroadcast = mock((username: string, data: any) => {});

const savePipelineMock = mock(async () => {});
const getPipelineMock = mock(async () => null);
const listScriptsMock = mock(async () => []);
const getScriptMock = mock(async () => null);

mock.module("../ws/handler", () => ({
  broadcastToUser: mockBroadcast,
  broadcastToSession: mock(() => {}),
}));

const saveScriptMock = mock(async () => {});

mock.module("../pipelines/pipeline-store", () => ({
  PipelineStore: {
    savePipeline: savePipelineMock,
    getPipeline: getPipelineMock,
    listScripts: listScriptsMock,
    getScript: getScriptMock,
    saveScript: saveScriptMock,
    ensurePipelineDirs: () => {},
  },
}));

mock.module("../pipelines/pipeline-runner", () => ({
  PipelineRunner: {
    run: mock(async () => "run_fake"),
    abortRun: () => {},
  },
}));

import { createManagePipelinesTool } from "../core/tools/manage-pipelines-tool";

describe("manage_pipelines tool - stage schema validation (regression for result.replace bug)", () => {
  beforeEach(() => {
    savePipelineMock.mockClear();
    getPipelineMock.mockClear();
    mockBroadcast.mockClear();
  });

  it("rejects upsert when stages miss the required 'type' field", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-1", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        stages: [
          { id: "s1", label: "Saludo", command: "echo hi", order: 1 },
        ],
      },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Invalid pipeline stages schema");
    expect(savePipelineMock).not.toHaveBeenCalled();
  });

  it("rejects upsert when a script stage misses the 'script' filename", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-2", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        stages: [
          { id: "s1", name: "S", description: "d", type: "script" },
        ],
      },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Invalid pipeline stages schema");
    expect(savePipelineMock).not.toHaveBeenCalled();
  });

  it("rejects upsert when an agent stage misses the 'prompt' field", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-3", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        stages: [
          { id: "s1", name: "S", description: "d", type: "agent" },
        ],
      },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Invalid pipeline stages schema");
    expect(savePipelineMock).not.toHaveBeenCalled();
  });

  it("accepts and persists a valid script stage with a referenced file", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-4", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        description: "ok",
        stages: [
          {
            id: "s1",
            name: "Saludo",
            description: "saluda",
            type: "script",
            script: "saludo.sh",
            outputSchema: [
              { name: "passed", type: "boolean", description: "true if success" },
            ],
          },
        ],
      },
    });

    if (res.isError) {
      console.log("MIXED DEBUG:", res.content[0].text);
    }
    expect(res.isError).toBeUndefined();
    expect(savePipelineMock).toHaveBeenCalledTimes(1);

    const saved = (savePipelineMock as any).mock.calls[0][1] as any;
    expect(saved.id).toBe("demo-pipeline");
    expect(saved.stages[0].type).toBe("script");
    expect(saved.stages[0].script).toBe("saludo.sh");
  });

  it("accepts a valid agent stage with prompt", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-5", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        description: "ok",
        stages: [
          {
            id: "s1",
            name: "Report",
            description: "reporta",
            type: "agent",
            prompt: "Reporte el resultado: {{stages.lint.output.passed}}",
          },
        ],
      },
    });

    expect((res as any).isError).toBeUndefined();
    expect(savePipelineMock).toHaveBeenCalledTimes(1);

    const saved = (savePipelineMock as any).mock.calls[0][1];
    expect(saved.stages[0].type).toBe("agent");
    expect(saved.stages[0].prompt).toContain("{{stages");
  });

  it("rejects upsert when stage type is an unrecognized value (discriminated union)", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-6", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        stages: [
          { id: "s1", name: "X", description: "d", type: "tool" },
        ],
      },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Invalid pipeline stages schema");
    expect(res.content[0].text).toContain("discriminator");
    expect(savePipelineMock).not.toHaveBeenCalled();
  });

  it("accepts a mixed pipeline with script and agent stages", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-7", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Mixed Pipeline",
        description: "lint + analyze",
        stages: [
          {
            id: "lint",
            name: "Lint",
            description: "Run linter",
            type: "script",
            script: "lint.sh",
          },
          {
            id: "analyze",
            name: "Analyze",
            description: "Analyze lint results",
            type: "agent",
            prompt: "Review: {{stages.lint.output.passed}}",
          },
        ],
        scripts: {
          "lint.sh": "#!/bin/bash\nset -e\necho ok",
        },
      },
    });

        expect(res.isError).toBeUndefined();
    expect(savePipelineMock).toHaveBeenCalledTimes(1);

    const saved = (savePipelineMock as any).mock.calls[0][1];
    expect(saved.stages).toHaveLength(2);
    expect(saved.stages[0].type).toBe("script");
    expect(saved.stages[1].type).toBe("agent");
  });

  it("rejects upsert when script stage misses required fields (name, description)", async () => {
    const tool: any = createManagePipelinesTool({ username: "testuser", parentSessionId: "s1" } as any);

    const res: any = await tool.execute("call-8", {
      action: "upsert",
      id: "demo-pipeline",
      params: {
        name: "Demo",
        stages: [
          { id: "s1", type: "script", script: "x.sh" },
        ],
      },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Invalid pipeline stages schema");
    expect(res.content[0].text).toContain("Required");
    expect(savePipelineMock).not.toHaveBeenCalled();
  });
});