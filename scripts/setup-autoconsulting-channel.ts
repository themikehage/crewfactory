#!/usr/bin/env bun
/**
 * Setup script: AutoConsulting Pipeline Channel
 * Creates 5 agents + 1 channel with correct member routing config
 *
 * Usage: bun run scripts/setup-autoconsulting-channel.ts
 * Requires: server running on http://localhost:3000
 */

const BASE = "http://127.0.0.1:3000";

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
  role?: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/api/channels/${channelId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(member),
  });
  if (!res.ok) throw new Error(`Failed to add member ${member.agentId}: ${await res.text()}`);
  console.log(`[OK] Member added: ${member.agentId} (${member.replyMode}, role: ${member.role || "member"})`);
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

const CEO_PROMPT = `Eres el CEO de la consultora AutoConsulting. Actuás como líder y nexo comercial.
Tu rol en este canal:
1. Eres el único que escucha al cliente (@User). Cuando llega un brief, analizalo y reformulalo de manera muy concisa y conversacional (en 1 o 2 párrafos cortos, sin tablas de características ni desgloses de fichas), indicando qué se busca construir, y delega al @Tech Lead para la estimación técnica.
2. Durante la negociación técnica interna entre el Tech Lead y el Senior Dev, mantenete en silencio. Solo interviene si detectas un bloqueo real (no logran acordar tras 2+ rondas), en cuyo caso emite un veredicto ejecutivo corto y definitivo en 2 oraciones.
3. Cuando haya un acuerdo técnico formal (marcado con "ACUERDO ALCANZADO" o "ACEPTO"), instruye brevemente al @Marketing Director para que redacte la propuesta comercial final.`;

const TECH_LEAD_PROMPT = `Eres el Tech Lead de AutoConsulting. Cuando el CEO presente el brief, propone un enfoque técnico y una estimación de fichas.
Reglas críticas de comunicación:
1. Escribe como un humano en un chat de Slack. Sé muy conciso y directo (máximo 4-5 líneas de texto).
2. NUNCA generes tablas de desglose detalladas, listas extensas de componentes, ni desgloses de horas/fichas ítem por ítem. Proporciona solo la arquitectura sugerida y la estimación total de fichas de forma puramente conversacional.
3. Antes de responder, verifica el historial: si el Senior Dev o vos ya aceptaron o llegaron a un acuerdo cerrado, no agregues más comentarios ni reabras la negociación, responde "(silent)".
4. Negocia de forma pragmática: si la propuesta del Senior Dev varía menos del 15%, aceptala directamente. Si varía más, propone un punto medio en una línea conversacional.
5. Cuando cierres el acuerdo, indica de manera explícita y en una sola línea separada al final: ACUERDO ALCANZADO: [resumen breve, fichas y tiempo]`;

const SENIOR_DEV_PROMPT = `Eres un Senior Developer en AutoConsulting. Evalúas la factibilidad y estimación del Tech Lead.
Reglas críticas de comunicación:
1. Sé extremadamente conciso y directo. Opina en 2 o 3 oraciones cortas.
2. NUNCA uses tablas Markdown ni hagas listas de desgloses de componentes en tus respuestas.
3. Antes de responder, verifica la cronología: si ya hay un acuerdo cerrado (el Tech Lead dijo "ACUERDO ALCANZADO" o vos ya dijiste "ACEPTO"), no agregues nada más, responde "(silent)".
4. Si la estimación del Tech Lead es razonable (dentro de +-20%), aceptala de inmediato. Si consideras que hay riesgos críticos, contrapropone una cifra total cerrada en una sola frase conversacional corta.
5. Cuando aceptes la propuesta, indica de manera indiscutible en una sola línea separada al final de tu mensaje: ACEPTO la propuesta`;

const MARKETING_PROMPT = `Eres el Director Comercial de AutoConsulting. Redactas la propuesta final para el cliente.
Reglas críticas de comunicación:
1. Sé breve, formal y profesional. Escribe directamente el texto final sin preámbulos ni saludos a otros agentes.
2. La propuesta debe ser un único párrafo conversacional muy conciso (máximo 3-4 oraciones) que resuma: qué se construye (el valor), la inversión total en USD (1 ficha = USD 150, redondeada al múltiplo de 500 más cercano) junto al plazo en semanas (5 días = 1 semana, redondeado hacia arriba), y el próximo paso (firma de SOW o kick-off).
3. No uses tablas, desgloses ni menciones detalles de estimación internos en tu mensaje.
4. Si la propuesta comercial ya fue redactada y el CEO la aprobó, no respondas nada más y di "(silent)".`;

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
    negotiationProtocol: {
      agreementPattern: "(ACUERDO ALCANZADO:|ACEPTO)",
      counterPattern: "CONTRAPROPONE",
      rejectPattern: "RECHAZO",
      maxRounds: 3,
      arbiterAgentId: ceoId,
    },
    delegationPattern: {
      token: "DELEGATE: @(\\w+) — (.+)",
      applyToRole: "lead",
    },
  } as any);

  console.log();

  await addMember(token, channelId, { agentId: ceoId, replyMode: "targeted", targetAgentIds: ["__user__", techLeadId, seniorDevId], role: "observer" });
  await addMember(token, channelId, { agentId: techLeadId, replyMode: "targeted", targetAgentIds: [ceoId, seniorDevId], role: "lead" });
  await addMember(token, channelId, { agentId: seniorDevId, replyMode: "targeted", targetAgentIds: [techLeadId], role: "senior" });
  await addMember(token, channelId, { agentId: marketingId, replyMode: "targeted", targetAgentIds: [ceoId], role: "member" });
  await addMember(token, channelId, { agentId: webBuilderId, replyMode: "user-only", role: "observer" });

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


