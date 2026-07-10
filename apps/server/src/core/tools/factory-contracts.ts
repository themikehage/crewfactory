export interface ParamDef {
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ActionContract {
  description: string;
  params: Record<string, ParamDef>;
}

export interface EntityContract {
  entity: string;
  description: string;
  actions: {
    get: ActionContract;
    upsert: ActionContract;
    delete: ActionContract;
  };
}

export const FACTORY_CONTRACTS: Record<string, EntityContract> = {
  agents: {
    entity: "agents",
    description: "Autonomous programmatic agents with isolated workspaces",
    actions: {
      get: {
        description: "List all agents or get one by id",
        params: {
          id: { type: "string", required: false, description: "Agent ID. Omit to list all." },
        },
      },
      upsert: {
        description: "Create a new agent or update an existing one",
        params: {
          id: { type: "string", required: true, description: "Unique agent identifier" },
          name: { type: "string", required: true, description: "Display name for the agent" },
          role: { type: "string", required: true, description: "Agent role (e.g. reviewer, builder, tester)" },
          systemPrompt: { type: "string", required: false, description: "System prompt defining agent behavior" },
          model: { type: "string", required: false, description: "Model identifier (e.g. anthropic/claude-3-5-sonnet-20241022)" },
          skills: { type: "array", required: false, description: "Array of skill IDs to attach" },
          avatarUrl: { type: "string", required: false, description: "URL for agent avatar image" },
        },
      },
      delete: {
        description: "Stop and remove an agent permanently",
        params: {
          id: { type: "string", required: true, description: "Agent ID to delete" },
        },
      },
    },
  },

  projects: {
    entity: "projects",
    description: "Git repositories and project workspaces",
    actions: {
      get: {
        description: "List all projects or get one by id",
        params: {
          id: { type: "string", required: false, description: "Project UUID or name. Omit to list all." },
        },
      },
      upsert: {
        description: "Create a new project (empty or clone) or update project name",
        params: {
          id: { type: "string", required: true, description: "Project name (used as workspace identifier)" },
          name: { type: "string", required: true, description: "Project name" },
          cloneUrl: { type: "string", required: false, description: "Git URL to clone. Omit to create empty project. Only used on creation." },
        },
      },
      delete: {
        description: "Delete a project and its workspace permanently",
        params: {
          id: { type: "string", required: true, description: "Project UUID or name to delete" },
        },
      },
    },
  },

  channels: {
    entity: "channels",
    description: "Multi-agent collaboration channels",
    actions: {
      get: {
        description: "List all channels or get one by id",
        params: {
          id: { type: "string", required: false, description: "Channel ID. Omit to list all." },
        },
      },
      upsert: {
        description: "Create a new channel or update an existing one",
        params: {
          id: { type: "string", required: true, description: "Unique channel identifier" },
          name: { type: "string", required: true, description: "Display name for the channel" },
          description: { type: "string", required: false, description: "Channel purpose description" },
          members: { type: "array", required: false, description: "Array of { agentId, replyMode: auto|manual|broadcast }" },
          negotiationProtocol: { type: "boolean", required: false, description: "Enable structured negotiation between members" },
        },
      },
      delete: {
        description: "Delete a channel permanently",
        params: {
          id: { type: "string", required: true, description: "Channel ID to delete" },
        },
      },
    },
  },

  sessions: {
    entity: "sessions",
    description: "Agent chat sessions and execution logs",
    actions: {
      get: {
        description: "List all sessions or get one by id",
        params: {
          id: { type: "string", required: false, description: "Session ID. Omit to list all." },
        },
      },
      upsert: {
        description: "Sessions are created implicitly via chat. Upsert is not supported.",
        params: {},
      },
      delete: {
        description: "Delete a session and its data permanently",
        params: {
          id: { type: "string", required: true, description: "Session ID to delete" },
        },
      },
    },
  },

  env: {
    entity: "env",
    description: "Global environment variables for deployment keys and service credentials",
    actions: {
      get: {
        description: "List all env vars (values masked) or reveal one by key",
        params: {
          key: { type: "string", required: false, description: "Variable key to reveal. Omit to list all (masked)." },
        },
      },
      upsert: {
        description: "Set or update an environment variable",
        params: {
          key: { type: "string", required: true, description: "Variable name (uppercase, e.g. GITHUB_TOKEN)" },
          value: { type: "string", required: true, description: "Variable value (stored encrypted at rest)" },
        },
      },
      delete: {
        description: "Remove an environment variable",
        params: {
          key: { type: "string", required: true, description: "Variable key to delete" },
        },
      },
    },
  },

  providers: {
    entity: "providers",
    description: "LLM provider API keys (Anthropic, OpenAI, Google, Groq, DeepSeek, etc.)",
    actions: {
      get: {
        description: "List all providers with auth status or get one by id",
        params: {
          id: { type: "string", required: false, description: "Provider ID (e.g. openai, anthropic). Omit to list all." },
        },
      },
      upsert: {
        description: "Set or update an API key for a provider",
        params: {
          id: { type: "string", required: true, description: "Provider ID (e.g. openai, anthropic, groq)" },
          apiKey: { type: "string", required: true, description: "The API key to set" },
        },
      },
      delete: {
        description: "Revoke and remove an API key for a provider",
        params: {
          id: { type: "string", required: true, description: "Provider ID to revoke key for" },
        },
      },
    },
  },

  skills: {
    entity: "skills",
    description: "Custom reusable agent skills (SKILL.md files)",
    actions: {
      get: {
        description: "List all custom skills or get one by name with full content",
        params: {
          id: { type: "string", required: false, description: "Skill name. Omit to list all." },
        },
      },
      upsert: {
        description: "Create or update a custom skill",
        params: {
          id: { type: "string", required: true, description: "Skill identifier (directory name)" },
          name: { type: "string", required: true, description: "Skill display name" },
          description: { type: "string", required: true, description: "Short description shown in skill list" },
          content: { type: "string", required: true, description: "Full markdown skill instructions (SKILL.md body)" },
        },
      },
      delete: {
        description: "Delete a custom skill permanently",
        params: {
          id: { type: "string", required: true, description: "Skill name to delete" },
        },
      },
    },
  },

  experiments: {
    entity: "experiments",
    description: "Laboratory experiments for multi-agent evaluation",
    actions: {
      get: {
        description: "List all experiments or get one by id",
        params: {
          id: { type: "string", required: false, description: "Experiment ID. Omit to list all." },
        },
      },
      upsert: {
        description: "Create or update an experiment",
        params: {
          id: { type: "string", required: true, description: "Experiment ID (UUID for new)" },
          name: { type: "string", required: true, description: "Experiment name" },
          taskPrompt: { type: "string", required: true, description: "Task prompt for the experiment" },
          judge: { type: "object", required: false, description: "Judge configuration with criteria array" },
        },
      },
      delete: {
        description: "Delete an experiment permanently",
        params: {
          id: { type: "string", required: true, description: "Experiment ID to delete" },
        },
      },
    },
  },
};
