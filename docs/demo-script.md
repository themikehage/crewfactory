# Demo Script — Qwen Cloud Hackathon

**Duration:** ~2:45
**Video:** Screen recording, 1080p, no microphone audio
**Setup:** CrewFactory running locally with DASHSCOPE_API_KEY configured, admin account created

---

## Scene 1: Login & Dashboard (0:00-0:20)

**Goal:** Show the landing experience and multi-project sidebar.

```
0:00  → Open browser to http://localhost:3000
0:02  → Login form appears (Better Auth cookie-based)
0:05  → Enter admin credentials, click Login
0:08  → Dashboard loads with project cards
0:10  → Show sidebar: Projects, Agents, Channels, Settings, MCP Marketplace
0:15  → Show "Powered by Qwen" badge in hero section
0:18  → Hover over a project card to show info tooltip with clone URL and disk path
```

**Screenshot:** Dashboard page with sidebar and project cards visible

---

## Scene 2: Create Experiment from Blueprint (0:20-0:45)

**Goal:** Demonstrate the laboratory system — loading a predefined multi-agent experiment.

```
0:20  → Click "Experiments" in sidebar
0:22  → Click "New Experiment"
0:24  → Select "AutoConsulting" blueprint from dropdown
0:26  → Show blueprint details: 5 agents (CEO, Tech Lead, Senior Dev, Marketing, WebBuilder)
0:28  → Show channel config: negotiationProtocol (agreement/reject/counter patterns, maxRounds=3, arbiter=CEO)
0:32  → Show 3 test cases: Landing Page (20h), E-Commerce MVP (60h), SaaS Dashboard (180h)
0:35  → Show scoring config: taskQuality 50%, efficiencyScore 30%, negotiationScore 20%
0:38  → Click "Create Experiment"
0:40  → Experiment detail page opens — 3 variant panels: Single, Multi No Leader, Multi With Leader
0:42  → Show the "Run Experiment" button
```

**Screenshot:** Experiment creation modal with blueprint selected

---

## Scene 3: Run Experiment — Live Negotiation (0:45-1:40)

**Goal:** The money shot. Live streaming of 3 variants executing with visible negotiation.

```
0:45  → Click "Run Experiment" button
0:48  → Experiment starts: status changes to "running", active variant highlighted
0:50  → VARIANT A (Single Agent Baseline) begins:
0:52    → Single agent receives the brief
0:54    → Agent streams its response (thinking + tool calls visible)
0:58    → Variant A completes → token count and duration displayed
1:00  → VARIANT B (Multi-Agent Horizontal) begins:
1:02    → 3+ agents appear: CEO, Tech Lead, Senior Dev
1:04    → Agents broadcast to each other
1:06    → Show round badges appearing: "Ronda 1/3"
1:08    → Agents propose and counter-propose
1:10    → Show WS events in real-time: channel_negotiation_round, channel_negotiation_agreement
1:14    → "ACUERDO ALCANZADO" badge appears
1:15    → Variant B completes
1:18  → VARIANT C (Multi-Agent Hierarchical with Leader) begins:
1:20    → CEO (lead) posts the task
1:22    → CEO @mentions TechLead to delegate scope estimation
1:24    → TechLead responds, counters CEO's proposal
1:26    → Show "Ronda 2/3" — counter-proposal detected by state machine
1:28    → After maxRounds=3, CEO as arbiter issues binding verdict
1:30    → Show "ARBITRAJE CEO" badge — automated escalation
1:32    → Marketing Director produces final proposal
1:34    → Variant C completes
1:36  → LLM-Judge evaluation runs (auto-triggered after all 3 variants)
1:38    → Judge reasoning streams in real-time via WS
```

**Screenshot:** Experiment running with live chat logs, negotiation badges visible

---

## Scene 4: Compare Results — A/B/C Benchmark (1:40-2:10)

**Goal:** Show the quantitative comparison that proves multi-agent > single-agent.

```
1:40  → Experiment status changes to "completed"
1:42  → Click "Comparativa" tab
1:44  → Show side-by-side variant cards:
         - Variant A (Single): taskQuality 72, efficiencyScore 100 (baseline), globalScore 83
         - Variant B (Multi No Leader): taskQuality 85, efficiencyScore 78, negotiationScore 82, globalScore 84
         - Variant C (Multi With Leader): taskQuality 88, efficiencyScore 82, negotiationScore 91, globalScore 87 ★
1:48  → Point to variant C's crown icon (winner)
1:50  → Click to expand per-criteria breakdown table:
         | Criterion    | A (Single) | B (No Lead) | C (With Lead) |
         | taskQuality  | 72         | 85          | 88 ★          |
         | efficiency   | 100        | 78          | 82            |
         | negotiation  | N/A        | 82          | 91 ★          |
         | globalScore  | 83         | 84          | 87 ★          |
1:55  → Click to expand judge reasoning for variant C
1:58  → Show judge's analysis: "With a lead agent coordinating, the team reached consensus in fewer rounds while maintaining higher output quality"
2:00  → Mention: "C > B > A — hierarchical negotiation outperforms both single-agent and flat multi-agent"
```

**Screenshot:** Comparativa tab with victory crown and criteria breakdown table

---

## Scene 5: Export to Workspace & Verify Channel (2:10-2:35)

**Goal:** Show that lab results are actionable — turn winning variant into permanent workspace entities.

```
2:10  → Click "Export to Workspace" on variant C
2:12  → Confirmation: 3 agents + 1 channel created in workspace
2:14  → Navigate to Channels in sidebar
2:16  → New channel "AutoConsulting (Exported)" appears in list
2:18  → Click to open channel
2:20  → Show Org Chart tab with @xyflow/react hierarchy:
         - CEO (lead, top)
         - Tech Lead (senior, connected to CEO)
         - Senior Dev (senior, connected to Tech Lead)
         - Marketing Director (member, connected to CEO)
2:24  → Switch to Chat tab
2:26  → Click channel settings gear icon
2:28  → Show negotiationProtocol config in settings modal:
         - agreementPattern: "ACUERDO ALCANZADO:"
         - counterPattern: "CONTRAPROPONE:"  
         - rejectPattern: "RECHAZO"
         - maxRounds: 3
         - arbiterAgentId: ceo
2:32  → Show MCP tab in settings: GitHub, Brave Search, Fetch servers active
```

**Screenshot:** Channel Org Chart with hierarchy, channel settings showing negotiation protocol

---

## Scene 6: MCP & Qwen Provider Config (2:35-2:45)

**Goal:** Show the infrastructure: MCP integration and native Qwen Cloud provider.

```
2:35  → Navigate to Settings → MCP tab
2:36  → Show list of connected MCP servers (GitHub: connected, Brave Search: connected)
2:38  → Toggle one server off and back on
2:40  → Navigate to Settings → Providers tab
2:41  → Show Qwen Cloud provider card with status indicator
2:42  → Click "Info" to show model matrix: 8 Qwen models, context windows, capabilities
2:43  → Show "Qwen 3.7 Max" with vision + thinking capability badges
2:44  → Footer: "Powered by Qwen Cloud · MIT License · Open Source"
2:45  → Fade to black with GitHub URL and thank you
```

**Screenshot:** MCP tab with active servers, Provider tab showing Qwen Cloud model matrix

---

## Post-Recording Checklist

- [ ] Trim to exactly 2:59 or less
- [ ] No microphone audio — clean screen recording only
- [ ] Upload to YouTube as "Unlisted"
- [ ] Set title: "CrewFactory — Multi-Agent Negotiation Platform (Qwen Cloud Hackathon 2026)"
- [ ] Add description with GitHub repo link, track info, and timestamps
- [ ] Test the YouTube link works in incognito mode
- [ ] Add video link to README.md

---

## Fallback Short Demo (if 3 min is tight)

If the full flow takes too long, cut scenes 5-6 and condense:

- 0:00-0:15 Login + Dashboard
- 0:15-0:30 Create experiment from blueprint
- 0:30-1:20 Run experiment (show all 3 variants with negotiation badges)
- 1:20-1:50 Compare results (A/B/C scores)
- 1:50-2:15 Export variant + show channel negotiation config
- 2:15-2:45 MCP + Qwen provider + outro
