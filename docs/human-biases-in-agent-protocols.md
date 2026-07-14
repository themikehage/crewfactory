# Human Social Biases in Multi-Agent Protocols

## The Discovery

The single largest source of inefficiency in multi-agent channels is not technical — it is **anthropomorphic**. We designed agent communication protocols by transplanting human social norms without examining whether they apply to LLMs.

Two patterns account for an estimated **70% of wasted tokens** in multi-agent interactions:

### 1. The Sandwich Feedback Loop

**Human origin:** "Praise before correction" — you soften critical feedback with a compliment so the recipient stays receptive. Necessary because humans have egos, emotional reactions, and defense mechanisms.

**In agents:** The system explicitly tells agents "NUNCA comiences tu respuesta con cortesias" (`protocol.ts`), while simultaneously telling them "Eres un asistente amable y servicial" (`identity.ts` → systemPrompt). The LLM's training data overwhelmingly reinforces politeness. The negative instruction loses.

The result is a **courtesy spiral**:
```
Agent 1: "Excelente análisis, compañero. Solo agregaría que..."
Agent 2: "Gracias por tus comentarios. Me parece muy acertado. Para complementar..."
Agent 1: "Perfecto, totalmente de acuerdo. Revisando tu propuesta..."
```

Every turn burns 50-200 tokens on social lubrication that an LLM does not need.

### 2. The Full-Context Restatement Reflex

**Human origin:** When reviewing a document, humans repeat context because we cannot assume the other person remembers every detail. Re-stating the full picture ensures alignment and catches misunderstandings.

**In agents:** Every agent in every round has the **entire conversation history** in their context window. They read the same `buildAgentPrompt()` output — `Conversation so far:\n${historyText}` — that includes every previous full proposal. Yet each specialist still restates the full proposal before suggesting a change:

```
Agent 2 (security): "En la propuesta de arquitectura que presentó el líder,
que incluye una base de datos PostgreSQL, un backend en Node.js, y un frontend
en React con Tailwind, creo que la parte de cifrado debería usar AES-256-GCM
en lugar de AES-128..."
```

That entire first sentence is **pure waste**. The leader already presented it. Agent 1 already acknowledged it. The conversation history has it. Agent 2 just needs to say: `database.encryption: 'AES-128' -> 'AES-256-GCM' | Compliance requirement`.

---

## Why This Changes Everything

This is not a bug. It is not a missing feature. It is a **category error** — treating software agents as if they were human collaborators.

The implications cascade across every layer:

### Design Level
Every time we ask "how would humans handle this?" and implement the answer directly, we introduce inefficiency. The correct question is: "what is the minimal information exchange needed for this decision?"

### Prompt Level
Negative instructions ("NO seas cortes") are ineffective against base training. The LLM was optimized across trillions of tokens to be helpful and polite. A single line in a system prompt will not override that. **Structural enforcement beats instructional prohibition.**

### Architecture Level
The reply modes, the negotiation protocol, the role hierarchy — all borrowed from human organizational theory (RACI charts, Scrum teams, military chain of command). They assume agents need the same coordination overhead that humans do.

### Cost Level
Every wasted token is real money. With frontier models at $15/M input tokens, a single multi-agent exchange burning 50K tokens on courtesies and restatements costs $0.75+ per run for zero informational value.

---

## The Correct Mental Model

**LLMs are not employees. They are reasoning engines with a chat interface.**

A human team needs:
- Social bonding to maintain trust
- Context restatement to ensure shared understanding
- Gradual escalation to avoid defensive reactions
- Status acknowledgments to respect hierarchy

An LLM team needs:
- The current decision boundary
- The specific dimension where input is needed
- A structured output format for that input
- Nothing else

The optimal multi-agent protocol is closer to a **distributed system** than a **human meeting**. Think function calls with typed parameters, not a Slack channel.

---

## Applying This

### What to remove entirely
- Courtesy preambles and closings in agent-to-agent messages
- Full proposal restatements by non-lead agents
- Status acknowledgments ("received", "understood", "noted")
- Agreement affirmations that add no new information

### What to minimize
- Role protocol descriptions (replace with 1-line format specs)
- Environment context injection in non-execution channels
- Memory context retrieval when the decision space is fully specified

### What to add
- **Output format as first-class constraint**: each agent role specifies its output schema (diff-line, full proposal, vote), not its social behavior.
- **Post-processing gating**: strip prohibited patterns after generation rather than hoping the prompt prevents them.
- **Minimum viable context**: only inject the subset of history relevant to the agent's role, not the full conversation.

---

## The litmus test

Before adding any instruction to an agent prompt, ask:

> "Would I include this instruction if the agent were a pure function `f(context) → output` instead of a chat participant?"

If the answer is no, the instruction is an anthropomorphic artifact and should be removed or restructured.
