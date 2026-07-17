import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkills, type Skill } from "./load-skills";

export interface ResourceDiagnostic {
  severity: "error" | "warning";
  message: string;
  filePath?: string;
}

export interface DefaultResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  additionalSkillPaths?: string[];
  appendSystemPrompt?: string[];
  loadAgentsFiles?: boolean;
  loadSkills?: boolean;
}

export class DefaultResourceLoader {
  private cwd: string;
  private agentDir: string;
  private additionalSkillPaths: string[];
  private appendSystemPrompt: string[];
  private loadAgentsFiles: boolean;
  private loadSkills: boolean;
  
  private agentsFiles: Array<{ path: string; content: string }> = [];
  private skills: Skill[] = [];
  private diagnostics: ResourceDiagnostic[] = [];
  private systemPrompt: string | undefined;

  constructor(options: DefaultResourceLoaderOptions) {
    this.cwd = options.cwd;
    this.agentDir = options.agentDir;
    this.additionalSkillPaths = options.additionalSkillPaths || [];
    this.appendSystemPrompt = options.appendSystemPrompt || [];
    this.loadAgentsFiles = options.loadAgentsFiles !== false;
    this.loadSkills = options.loadSkills !== false;
  }

  async reload(): Promise<void> {
    this.agentsFiles = [];
    this.skills = [];
    this.diagnostics = [];
    this.systemPrompt = undefined;

    // 1. Cargar archivos de contexto (AGENTS.md)
    if (this.loadAgentsFiles) {
      const contextCandidates = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
      
      // Primero el global (en agentDir)
      let globalContent = "";
      for (const filename of contextCandidates) {
        const filePath = join(this.agentDir, filename);
        if (existsSync(filePath)) {
          try {
            globalContent = readFileSync(filePath, "utf-8");
            this.agentsFiles.push({ path: filePath, content: globalContent });
            break;
          } catch {}
        }
      }

      // Luego el local (en cwd)
      let localContent = "";
      for (const filename of contextCandidates) {
        const filePath = join(this.cwd, filename);
        if (existsSync(filePath)) {
          try {
            localContent = readFileSync(filePath, "utf-8");
            this.agentsFiles.push({ path: filePath, content: localContent });
            break;
          } catch {}
        }
      }

      // Combinar sistema
      const promptParts: string[] = [];
      if (globalContent) promptParts.push(globalContent);
      if (localContent) promptParts.push(localContent);
      
      if (promptParts.length > 0) {
        this.systemPrompt = promptParts.join("\n\n");
      }
    }

    // 2. Cargar Skills
    if (this.loadSkills) {
      try {
        const result = loadSkills({
          cwd: this.cwd,
          agentDir: this.agentDir,
          skillPaths: this.additionalSkillPaths,
          includeDefaults: true,
        });
        this.skills = result.skills;
        this.diagnostics = result.diagnostics;
      } catch (e: any) {
        this.diagnostics.push({
          severity: "error",
          message: `Failed to load skills: ${e.message}`,
        });
      }
    }
  }

  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
    return { skills: this.skills, diagnostics: this.diagnostics };
  }

  getExtensions(): { extensions: any[]; diagnostics: any[] } {
    return { extensions: [], diagnostics: [] };
  }

  getPrompts(): { prompts: any[]; diagnostics: any[] } {
    return { prompts: [], diagnostics: [] };
  }

  getThemes(): { themes: any[]; diagnostics: any[] } {
    return { themes: [], diagnostics: [] };
  }

  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
    return { agentsFiles: this.agentsFiles };
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  setAppendSystemPrompt(prompts: string[]): void {
    this.appendSystemPrompt = prompts;
  }

  getAppendSystemPrompt(): string[] {
    return this.appendSystemPrompt;
  }

  extendResources(paths: any): void {}
}
