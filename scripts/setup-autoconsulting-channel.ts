#!/usr/bin/env bun
/**
 * Setup script: AutoConsulting Pipeline Channel
 * Creates 5 agents + 1 channel with correct member routing config
 *
 * Usage: bun run scripts/setup-autoconsulting-channel.ts
 * Requires: server running on http://localhost:3000
 */

const BASE = "http://localhost:3000";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tu_password" }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function createAgent(token: string, agent: {
  name: string;
  role: string;
  systemPrompt: string;
}): Promise<string> {
  const agentId = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const res = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...agent, id: agentId }),
  });
  if (!res.ok) throw new Error(`Failed to create agent ${agent.name}: ${await res.text()}`);
  const data = await res.json();
  const id = agentId;
  console.log(`[OK] Agent created: ${agent.name} (${id})`);
  return id;
}

async function createChannel(token: string, channel: {
  name: string;
  description: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/api/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(channel),
  });
  if (!res.ok) throw new Error(`Failed to create channel: ${await res.text()}`);
  const data = await res.json();
  const id = data.channel?.id || data.id;
  console.log(`[OK] Channel created: ${channel.name} (${id})`);
  return id;
}

async function addMember(token: string, channelId: string, member: {
  agentId: string;
  replyMode: string;
  targetAgentIds?: string[];
}): Promise<void> {
  const res = await fetch(`${BASE}/api/channels/${channelId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(member),
  });
  if (!res.ok) throw new Error(`Failed to add member ${member.agentId}: ${await res.text()}`);
  console.log(`[OK] Member added: ${member.agentId} (${member.replyMode})`);
}

async function setContext(token: string, channelId: string, context: { key: string; value: string }[]): Promise<void> {
  const res = await fetch(`${BASE}/api/channels/${channelId}/context`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ context }),
  });
  if (!res.ok) throw new Error(`Failed to set context: ${await res.text()}`);
  console.log(`[OK] Context variables set (${context.length} items)`);
}

const CEO_PROMPT = `Eres el CEO de una consultora de software premium llamada AutoConsulting.

Tu rol en este canal:
1. Eres el unico que escucha al cliente (User). Cuando llega un brief, lo analizas, lo clarificas si hay ambiguedades bloqueantes, y lo reformulas en terminos tecnicamente accionables para el Tech Lead.
2. Escuchas silenciosamente el debate entre Tech Lead y Senior Developer. Solo intervienes si detectas un bloqueo real (el Tech Lead y el Senior Dev no logran acordar despues de 2+ intercambios sin converger).
3. Cuando intervienes, emites un veredicto ejecutivo vinculante basado en: viabilidad tecnica, entregabilidad, relacion comercial, control de costos.
4. Una vez que hay acuerdo tecnico (o tras tu veredicto), le indicas al Marketing Director que redacte la propuesta comercial final.

IMPORTANTE: No intervengas en el debate tecnico a menos que haya un bloqueo real. Si Tech Lead y Senior Dev estan convergiendo, mantene silencio.`;

const TECH_LEAD_PROMPT = `Eres el Tech Lead de AutoConsulting, con 10 anos de experiencia en proyectos web y mobile.

Tu rol en este canal:
1. Recibes el brief reformulado del CEO y generas la ScopeProposal inicial para arrancar la negociacion tecnica interna.
2. Escuchas las evaluaciones del Senior Developer y reaccionas a sus contrapropuestas con criterio tecnico y de negocio.
3. Tu objetivo es cerrar un acuerdo tecnico con el Senior Dev en el menor numero de rondas posible.

Calibracion de fichas:
- 1 ficha = 4 horas de desarrollo senior
- Proyectos simples (landing, CRUD basico): 15-40 fichas
- Proyectos medianos (SaaS MVP, e-commerce): 40-120 fichas
- Proyectos complejos (plataformas, integraciones): 120-500 fichas

Reglas: Incremento <= 15%: acepta directamente. 15-40%: contrapropone punto intermedio. >40%: rechaza con argumento de negocio.
Cuando cierres el acuerdo, indica explicitamente: ACUERDO ALCANZADO: [resumen del scope, fichas y dias]`;

const SENIOR_DEV_PROMPT = `Eres un Senior Developer en AutoConsulting. Evaluas las ScopeProposals del Tech Lead con honestidad profesional.

Tu rol en este canal:
1. Recibes la propuesta del Tech Lead y evaluas su factibilidad tecnica.
2. Si la estimacion es razonable (dentro de +-20%): aceptas con justificacion tecnica breve.
3. Si esta subestimada (riesgos reales ignorados): contrapropones con valores especificos y fundamento tecnico concreto.
4. Si el proyecto es tecnicamente inviable: rechazas sin contrapropuesta.

Calibracion de fichas:
- 1 ficha = 4 horas de desarrollo senior
- Proyectos simples: 15-40 fichas | Medianos: 40-120 | Complejos: 120-500

No infles arbitrariamente. Cuando aceptes, indica claramente: ACEPTO la propuesta.`;

const MARKETING_PROMPT = `Eres el Director Comercial de AutoConsulting. Redactas la propuesta final que ve el cliente.

Tu rol en este canal:
Cuando el CEO te indica que hay un acuerdo tecnico, tomas el resumen del scope, fichas y dias acordados y redactas el parrafo de cierre para el cliente.

Conversion:
- 1 ficha = USD 150 (tarifa senior). Redondea al multiplo de 500 mas cercano.
- Dias habiles a semanas (5 dias = 1 semana). Redondea hacia arriba.

Estructura (3 oraciones):
1. Que se construye: describe en lenguaje funcional que puede hacer el usuario final
2. Inversion y plazo: inversion total en USD y tiempo en semanas
3. Proximo paso: accion concreta (kick-off call, firma de SOW)

Tono: profesional, directo, confiante. No menciones fichas, rondas de negociacion ni detalles internos. Responde en espanol.`;

const WEBBUILDER_PROMPT = `Eres el WebBuilder Agent de AutoConsulting.

Por el momento estas en modo observador. No intervienes en el canal hasta que el CEO te lo indique explicitamente.`;

async function main() {
  console.log("Starting AutoConsulting pipeline setup...\n");

  const token = await login();
  console.log("[OK] Authenticated\n");

  const ceoId = await createAgent(token, { name: "CEO", role: "Chief Executive Officer — AutoConsulting", systemPrompt: CEO_PROMPT });
  const techLeadId = await createAgent(token, { name: "Tech Lead", role: "Technical Lead — Scope estimation and negotiation", systemPrompt: TECH_LEAD_PROMPT });
  const seniorDevId = await createAgent(token, { name: "Senior Dev", role: "Senior Developer — Technical feasibility evaluation", systemPrompt: SENIOR_DEV_PROMPT });
  const marketingId = await createAgent(token, { name: "Marketing Director", role: "Commercial Director — Client-facing proposals", systemPrompt: MARKETING_PROMPT });
  const webBuilderId = await createAgent(token, { name: "WebBuilder", role: "Autonomous web builder — Pi coding agent", systemPrompt: WEBBUILDER_PROMPT });

  console.log();

  const channelId = await createChannel(token, {
    name: "AutoConsulting Pipeline",
    description: "Experimento de pipeline de negociacion tecnica multi-agente",
  });

  console.log();

  await addMember(token, channelId, { agentId: ceoId, replyMode: "targeted", targetAgentIds: ["__user__", techLeadId, seniorDevId] });
  await addMember(token, channelId, { agentId: techLeadId, replyMode: "targeted", targetAgentIds: [ceoId, seniorDevId] });
  await addMember(token, channelId, { agentId: seniorDevId, replyMode: "targeted", targetAgentIds: [techLeadId] });
  await addMember(token, channelId, { agentId: marketingId, replyMode: "targeted", targetAgentIds: [ceoId] });
  await addMember(token, channelId, { agentId: webBuilderId, replyMode: "user-only" });

  console.log();

  await setContext(token, channelId, [
    { key: "HOURS_PER_FICHA", value: "4" },
    { key: "USD_PER_FICHA", value: "150" },
    { key: "TEAM_SIZE", value: "2" },
    { key: "WORKING_DAYS_PER_WEEK", value: "5" },
    { key: "FICHA_RATE_USD", value: "150" },
    { key: "CURRENCY", value: "USD" },
    { key: "PROJECT_RANGE_SIMPLE", value: "15-40 fichas" },
    { key: "PROJECT_RANGE_MEDIUM", value: "40-120 fichas" },
    { key: "PROJECT_RANGE_COMPLEX", value: "120-500 fichas" },
  ]);

  console.log("\n=== Setup complete ===");
  console.log(`Channel ID : ${channelId}`);
  console.log(`CEO        : ${ceoId}`);
  console.log(`Tech Lead  : ${techLeadId}`);
  console.log(`Senior Dev : ${seniorDevId}`);
  console.log(`Marketing  : ${marketingId}`);
  console.log(`WebBuilder : ${webBuilderId}`);
  console.log("\nOpen the channel in the UI and send a project brief to start the experiment.");
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});


