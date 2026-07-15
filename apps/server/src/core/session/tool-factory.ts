import { createProgrammaticSessionSync } from "../../auth/onboarding";
import {
  createBashToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  createEditToolDefinition,
  createGrepToolDefinition,
  createFindToolDefinition,
  createLsToolDefinition
} from "../../ai";
import { filterSecretsFromOutput } from "../bash-output-filter";
import { createExaSearchTool } from "../tools/exa-search-tool";
import { createWebFetchTool } from "../tools/web-fetch";
import { createMemoryTools } from "../memory/memory-tools";
import { createUiTools } from "../tools/ui-tools";
import { createFactoryTool } from "../tools/factory-tool";
import { userConfigManager } from "./user-config";
import {
  createManageCustomToolsTool,
  customToolStorage,
  createCustomToolRuntime,
} from "../custom-tools";
import { scopeConfigManager } from "../scope";

export interface CreateSessionToolsParams {
  username: string;
  sessionId: string;
  workspaceDir: string;
  memoryEnabled: boolean;
  memory: any;
  modelRegistry: any;
  authStorage: any;
  resourceLoader: any;
  contextAgentId?: string;
}

export class SessionToolFactory {
  createSessionTools(params: CreateSessionToolsParams) {
    const {
      username,
      sessionId,
      workspaceDir,
      memoryEnabled,
      memory,
      modelRegistry,
      authStorage,
      resourceLoader,
      contextAgentId,
    } = params;

    const customBashTool = createBashToolDefinition(workspaceDir, {
      spawnHook: (context) => {
        const userEnv = userConfigManager.getUserEnv(username);
        const token = createProgrammaticSessionSync(username);
        return {
          ...context,
          env: {
            ...context.env,
            ...userEnv,
            TOKEN: token,
            JWT_TOKEN: token,
          },
        };
      },
      outputFilter: (output: string) => {
        const userEnv = userConfigManager.getUserEnv(username);
        const secrets = Object.values(userEnv).filter(Boolean);
        return filterSecretsFromOutput(output, secrets);
      },
    });

    const exaSearchTool = createExaSearchTool({ username });
    const webFetchTool = createWebFetchTool({ username });
    const memoryTools = memoryEnabled ? createMemoryTools(memory) : [];

    const uiTools = createUiTools(workspaceDir, username, false, {
      workspaceDir,
      username,
      parentSessionId: sessionId,
      modelRegistry,
      authStorage,
      resourceLoader,
    });

    const userEnv = userConfigManager.getUserEnv(username);
    const hasExaKey = !!(userEnv.EXA_API_KEY || process.env.EXA_API_KEY);

    const readTool = createReadToolDefinition(workspaceDir);
    const writeTool = createWriteToolDefinition(workspaceDir);
    const editTool = createEditToolDefinition(workspaceDir);
    const grepTool = createGrepToolDefinition(workspaceDir);
    const findTool = createFindToolDefinition(workspaceDir);
    const lsTool = createLsToolDefinition(workspaceDir);

    const factoryTool = createFactoryTool({
      username,
      parentSessionId: sessionId,
    });

    const manageCustomToolsTool = createManageCustomToolsTool({
      username,
      sessionId,
    });

    const resolvedToolNames = contextAgentId
      ? new Set(scopeConfigManager.resolveToolsForAgent(username, contextAgentId))
      : null;

    const activeCustomDefs = customToolStorage.loadAll(username).filter((d: any) =>
      d.enabled && (resolvedToolNames === null || resolvedToolNames.has(d.name))
    );
    const activeCustomTools = activeCustomDefs.map((def: any) =>
      createCustomToolRuntime(def, {
        cwd: workspaceDir,
        session: null as any, // resolved dynamically from sessionManager at execute time
        username,
        sessionId,
      })
    );

    const customTools = [
      customBashTool as any,
      readTool as any,
      writeTool as any,
      editTool as any,
      grepTool as any,
      findTool as any,
      lsTool as any,
      factoryTool as any,
      manageCustomToolsTool as any,
      ...activeCustomTools as any,
      ...uiTools as any,
      exaSearchTool as any,
      webFetchTool as any,
      ...memoryTools as any,
    ];

    return {
      customTools,
      hasExaKey,
    };
  }
}

export const sessionToolFactory = new SessionToolFactory();
