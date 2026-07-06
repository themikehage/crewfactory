import { existsSync, readFileSync } from "node:fs";

const token = process.env.TOKEN || process.env.JWT_TOKEN;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

function printUsage() {
  console.log(`
Usage: bun run scripts/delegate.ts [options]

Options:
  --agent <id>       Delegate task to a programmatic agent by ID
  --channel <id>     Delegate task to a multi-agent collaboration channel by ID
  --project <name>   Delegate task to a project-scoped session by project name
  --message <text>   The prompt or instruction message (Required)

Examples:
  bun run scripts/delegate.ts --agent deploy-bot --message "Deploy project"
  bun run scripts/delegate.ts --project my-react-app --message "Run typecheck"
  bun run scripts/delegate.ts --channel dev-room --message "Review code changes"
`);
}

async function main() {
  let agentId: string | null = null;
  let channelId: string | null = null;
  let projectName: string | null = null;
  let message: string | null = null;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--agent" && i + 1 < process.argv.length) {
      agentId = process.argv[++i];
    } else if (arg === "--channel" && i + 1 < process.argv.length) {
      channelId = process.argv[++i];
    } else if (arg === "--project" && i + 1 < process.argv.length) {
      projectName = process.argv[++i];
    } else if (arg === "--message" && i + 1 < process.argv.length) {
      message = process.argv[++i];
    }
  }

  if (!message) {
    console.error("Error: --message is required.");
    printUsage();
    process.exit(1);
  }

  if (!agentId && !channelId && !projectName) {
    console.error("Error: Must specify one target: --agent, --channel, or --project.");
    printUsage();
    process.exit(1);
  }

  if (!token) {
    console.error("Error: TOKEN or JWT_TOKEN environment variable must be defined.");
    process.exit(1);
  }

  if (agentId) {
    await delegateToAgent(agentId, message);
  } else if (projectName) {
    await delegateToProject(projectName, message);
  } else if (channelId) {
    await delegateToChannel(channelId, message);
  }
}

async function delegateToAgent(id: string, msg: string) {
  console.log(`\n>>> Delegating task to programmatic agent: "${id}"`);
  
  const response = await fetch(`${baseUrl}/api/agents/${id}/prompt`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: msg, stream: true }),
  });

  if (!response.ok) {
    console.error(`Failed to prompt agent: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }

  await streamResponse(response);
}

async function delegateToProject(name: string, msg: string) {
  console.log(`\n>>> Delegating task to project: "${name}"`);

  const sessionsRes = await fetch(`${baseUrl}/api/sessions`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!sessionsRes.ok) {
    console.error("Failed to list sessions:", await sessionsRes.text());
    process.exit(1);
  }

  const { sessions } = await sessionsRes.json();
  let projectSession = sessions.find((s: any) => s.projectName === name);
  let sessionId = projectSession?.id;

  if (!sessionId) {
    console.log(`Creating new session for project "${name}"...`);
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `CLI Project Session - ${name}`,
        projectName: name,
      }),
    });

    if (!createRes.ok) {
      console.error("Failed to create session:", await createRes.text());
      process.exit(1);
    }
    const newSession = await createRes.json();
    sessionId = newSession.id;
  }

  // 2. Post prompt to the streaming endpoint
  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/prompt/stream`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: msg }),
  });

  if (!response.ok) {
      console.error(`Failed to prompt project session: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }

  await streamResponse(response);
}

async function streamResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    console.error("Response body is not readable.");
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        if (dataStr === "{}") continue;
        try {
          const event = JSON.parse(dataStr);
          handleEvent(event);
        } catch {}
      }
    }
  }
}

function handleEvent(event: any) {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent?.delta;
    if (delta) {
      process.stdout.write(delta);
    }
  } else if (event.type === "thinking_update") {
    const delta = event.assistantMessageEvent?.delta;
    if (delta) {
      // Print thoughts in grey/dim format
      process.stdout.write(`\x1b[2m${delta}\x1b[0m`);
    }
  } else if (event.type === "tool_execution_start") {
    console.log(`\n\x1b[36m[Executing Tool: ${event.toolCall.name} with args: ${JSON.stringify(event.toolCall.arguments)}]\x1b[0m`);
  } else if (event.type === "tool_execution_end") {
    console.log(`\x1b[32m[Tool Execution Completed. Error: ${event.isError}]\x1b[0m`);
  } else if (event.type === "agent_error") {
    console.error(`\n\x1b[31m[Agent Error: ${event.error}]\x1b[0m`);
  }
}

async function delegateToChannel(id: string, msg: string) {
  console.log(`\n>>> Delegating task to channel: "${id}"`);

  const sessionId = `cli-channel-${Date.now()}`;

  // 1. Send prompt
  const sendRes = await fetch(`${baseUrl}/api/channels/${id}/send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: msg, sessionId }),
  });

  if (!sendRes.ok) {
    console.error("Failed to send message to channel:", await sendRes.text());
    process.exit(1);
  }

  // 2. Poll active streamings until finished
  let lastActiveAgent: string | null = null;
  const printedTexts = new Map<string, number>();
  const printedThoughts = new Map<string, number>();
  let emptyCount = 0;

  while (true) {
    const streamRes = await fetch(`${baseUrl}/api/channels/${id}/active-streamings?sessionId=${sessionId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!streamRes.ok) {
      console.error("Failed to fetch channel streams:", await streamRes.text());
      process.exit(1);
    }

    const { streamingAgents } = await streamRes.json();
    const agentIds = Object.keys(streamingAgents || {});

    if (agentIds.length === 0) {
      emptyCount++;
      if (emptyCount >= 4) { // 2 seconds of inactivity -> completed
        break;
      }
    } else {
      emptyCount = 0;
      for (const agentId of agentIds) {
        const stream = streamingAgents[agentId];
        if (lastActiveAgent !== agentId) {
          console.log(`\n\n\x1b[1m=== Agent: ${stream.agentName} ===\x1b[0m`);
          lastActiveAgent = agentId;
        }

        // Print thoughts delta
        if (stream.thinking) {
          const printedLen = printedThoughts.get(agentId) || 0;
          if (stream.thinking.length > printedLen) {
            const delta = stream.thinking.slice(printedLen);
            process.stdout.write(`\x1b[2m${delta}\x1b[0m`);
            printedThoughts.set(agentId, stream.thinking.length);
          }
        }

        // Print text delta
        if (stream.text) {
          const printedLen = printedTexts.get(agentId) || 0;
          if (stream.text.length > printedLen) {
            const delta = stream.text.slice(printedLen);
            process.stdout.write(delta);
            printedTexts.set(agentId, stream.text.length);
          }
        }
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n\n>>> Channel execution completed. Conversation Log:");
  
  // 3. Print final message log for this session
  const msgsRes = await fetch(`${baseUrl}/api/channels/${id}/messages?sessionId=${sessionId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (msgsRes.ok) {
    const { messages } = await msgsRes.json();
    for (const m of messages) {
      if (m.role === "agent") {
        console.log(`\n[${m.agentName || "Agent"}]: ${m.content}`);
      } else {
        console.log(`\n[User]: ${m.content}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal delegation error:", err);
  process.exit(1);
});
