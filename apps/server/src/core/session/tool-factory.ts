import jwt from "jsonwebtoken";
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
import { createMemoryTools } from "../memory/memory-tools";
import { createUiTools } from "../tools/ui-tools";
import { createFactoryTool } from "../tools/factory-tool";
import { userConfigManager } from "./user-config";

export interface CreateSessionToolsParams {
  username: string;
  sessionId: string;
  workspaceDir: string;
  memoryEnabled: boolean;
  memory: any;
  modelRegistry: any;
  authStorage: any;
  resourceLoader: any;
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
    } = params;

    const customBashTool = createBashToolDefinition(workspaceDir, {
      spawnHook: (context) => {
        const userEnv = userConfigManager.getUserEnv(username);
        const token = jwt.sign(
          { username },
          process.env.JWT_SECRET!,
          { expiresIn: "7d" }
        );
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

    const customTools = [
      customBashTool as any,
      readTool as any,
      writeTool as any,
      editTool as any,
      grepTool as any,
      findTool as any,
      lsTool as any,
      factoryTool as any,
      ...uiTools as any,
      exaSearchTool as any,
      ...memoryTools as any,
    ];

    return {
      customTools,
      hasExaKey,
    };
  }
}

export const sessionToolFactory = new SessionToolFactory();
