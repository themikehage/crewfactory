import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { PreviewConfig, FrameworkPreset } from "shared";

interface FrameworkPresetDef {
  framework: FrameworkPreset;
  buildCommand: string;
  outputDir: string;
  detectLabel: string;
}

const FRAMEWORK_PRESETS: Record<string, FrameworkPresetDef[]> = {
  "vite": [
    { framework: "vite", buildCommand: "npx --yes vite build", outputDir: "dist", detectLabel: "Vite" },
    { framework: "vite", buildCommand: "npx --yes vue-cli-service build", outputDir: "dist", detectLabel: "Vue CLI" },
  ],
  "next": [
    { framework: "next", buildCommand: "npx --yes next build", outputDir: ".next", detectLabel: "Next.js" },
    { framework: "next", buildCommand: "npx --yes next build && npx --yes next export", outputDir: "out", detectLabel: "Next.js (static)" },
  ],
  "nuxt": [
    { framework: "nuxt", buildCommand: "npx --yes nuxt build", outputDir: ".output", detectLabel: "Nuxt" },
  ],
  "astro": [
    { framework: "astro", buildCommand: "npx --yes astro build", outputDir: "dist", detectLabel: "Astro" },
  ],
  "react-scripts": [
    { framework: "custom", buildCommand: "npx --yes react-scripts build", outputDir: "build", detectLabel: "Create React App" },
  ],
  "parcel": [
    { framework: "custom", buildCommand: "npx --yes parcel build src/index.html", outputDir: "dist", detectLabel: "Parcel" },
  ],
  "webpack": [
    { framework: "custom", buildCommand: "npx --yes webpack --mode production", outputDir: "dist", detectLabel: "Webpack" },
  ],
};

function configPath(username: string, repoName: string): string {
  const base = `/tmp/crewfactory/${username}/workspace/repos/${repoName}`;
  return resolve(base, ".preview.json");
}

function hasPackageJson(repoDir: string): boolean {
  return existsSync(resolve(repoDir, "package.json"));
}

function hasFile(repoDir: string, file: string): boolean {
  return existsSync(resolve(repoDir, file));
}

function readPackageJson(repoDir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(resolve(repoDir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

function detectFromDeps(deps: Record<string, string>): FrameworkPresetDef | null {
  for (const [pkg, presets] of Object.entries(FRAMEWORK_PRESETS)) {
    if (deps[pkg]) return presets[0];
  }
  // Check devDeps too
  return null;
}

function detectFromScripts(scripts: Record<string, string>): FrameworkPresetDef | null {
  const scriptMap: [RegExp, string][] = [
    [/vite/, "vite"],
    [/next/, "next"],
    [/nuxt/, "nuxt"],
    [/astro/, "astro"],
    [/react-scripts/, "react-scripts"],
    [/parcel/, "parcel"],
    [/webpack/, "webpack"],
  ];
  for (const script of Object.values(scripts)) {
    for (const [regex, pkg] of scriptMap) {
      if (regex.test(script)) {
        const presets = FRAMEWORK_PRESETS[pkg];
        if (presets) return presets[0];
      }
    }
  }
  return null;
}

function detectFromConfigFiles(repoDir: string): FrameworkPresetDef | null {
  if (hasFile(repoDir, "vite.config.js") || hasFile(repoDir, "vite.config.ts")) {
    return FRAMEWORK_PRESETS["vite"][0];
  }
  if (hasFile(repoDir, "next.config.js") || hasFile(repoDir, "next.config.mjs")) {
    return FRAMEWORK_PRESETS["next"][0];
  }
  if (hasFile(repoDir, "nuxt.config.js") || hasFile(repoDir, "nuxt.config.ts")) {
    return FRAMEWORK_PRESETS["nuxt"][0];
  }
  if (hasFile(repoDir, "astro.config.mjs") || hasFile(repoDir, "astro.config.js")) {
    return FRAMEWORK_PRESETS["astro"][0];
  }
  return null;
}

function autoDetectFramework(username: string, repoName: string): PreviewConfig {
  const repoDir = resolve(`/tmp/crewfactory/${username}/workspace/repos/${repoName}`);

  if (!existsSync(repoDir)) {
    return { framework: "html", buildCommand: undefined, outputDir: undefined, autoDetected: true };
  }

  // 1. Check package.json dependencies and scripts
  if (hasPackageJson(repoDir)) {
    const pkg = readPackageJson(repoDir);
    if (pkg) {
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const fromDeps = detectFromDeps(allDeps);
      if (fromDeps) {
        return { framework: fromDeps.framework, buildCommand: fromDeps.buildCommand, outputDir: fromDeps.outputDir, autoDetected: true };
      }

      const fromScripts = detectFromScripts(pkg.scripts || {});
      if (fromScripts) {
        return { framework: fromScripts.framework, buildCommand: fromScripts.buildCommand, outputDir: fromScripts.outputDir, autoDetected: true };
      }
    }
  }

  // 2. Check config files
  const fromConfig = detectFromConfigFiles(repoDir);
  if (fromConfig) {
    return { framework: fromConfig.framework, buildCommand: fromConfig.buildCommand, outputDir: fromConfig.outputDir, autoDetected: true };
  }

  // 3. Check for index.html (static site fallback)
  if (hasFile(repoDir, "index.html") || hasFile(repoDir, "src/index.html")) {
    return { framework: "html", buildCommand: undefined, outputDir: undefined, autoDetected: true };
  }

  return { framework: "auto", buildCommand: undefined, outputDir: "dist", autoDetected: true };
}

export function loadPreviewConfig(username: string, repoName: string): PreviewConfig {
  const path = configPath(username, repoName);
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      return {
        framework: raw.framework || "auto",
        buildCommand: raw.buildCommand,
        outputDir: raw.outputDir,
        autoDetected: false,
      };
    } catch {}
  }

  return autoDetectFramework(username, repoName);
}

export function savePreviewConfig(
  username: string,
  repoName: string,
  config: { framework?: string; buildCommand?: string; outputDir?: string }
): PreviewConfig {
  const path = configPath(username, repoName);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const merged = {
    framework: (config.framework || "auto") as PreviewConfig["framework"],
    buildCommand: config.buildCommand || undefined,
    outputDir: config.outputDir || undefined,
  };

  writeFileSync(path, JSON.stringify(merged, null, 2), "utf-8");

  return {
    ...merged,
    autoDetected: false,
  };
}

export function getBuildOutputDir(config: PreviewConfig, username: string, repoName: string): string | null {
  const repoDir = resolve(`/tmp/crewfactory/${username}/workspace/repos/${repoName}`);
  const dir = config.outputDir || "dist";
  const candidate = resolve(repoDir, dir);
  if (existsSync(candidate)) return candidate;
  // If dir doesn't exist yet, still return the path — it will exist after build
  return candidate;
}

export function getBuildCommand(config: PreviewConfig, username: string, repoName: string): string | null {
  const repoDir = resolve(`/tmp/crewfactory/${username}/workspace/repos/${repoName}`);
  const pkg = readPackageJson(repoDir);

  if (config.buildCommand) return config.buildCommand;

  // If HTML framework, no build needed
  if (config.framework === "html") return null;

  // Try "npm run build" as fallback
  if (pkg?.scripts?.build) return `npm run build`;

  return null;
}

export function autoDetectConfig(username: string, repoName: string): PreviewConfig {
  return autoDetectFramework(username, repoName);
}
