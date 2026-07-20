import { Route, Routes } from "react-router-dom";
import { AppRouter } from "@/components/layout/AppRouter";
import { LaboratoryRoute } from "@/router/routes/LaboratoryRoute";
import { McpRedirectRoute } from "@/router/routes/McpRedirectRoute";
import { NotFoundRoute } from "@/router/routes/NotFoundRoute";
import { AgentsRoute, DashboardRoute, LogsRoute, PipelineRoute, PipelinesRoute, PluginsRoute, ProjectsRoute, SessionsRoute, SettingsRoute, SkillsRoute, TeamsRoute, AnalyticsRoute } from "@/router/routes/AdministrativeLeaves";
import { ChatRoute, DelegationsRoute, PreviewRoute, SessionRoute, TeamDetailRoute, TeamOrgRoute, WorkspaceRoute, TimelineRoute } from "@/router/routes/ContextLeaves";

export function AppRoutes() {
  return <Routes>
    <Route element={<AppRouter />}>
      <Route index element={<ChatRoute />} />
      <Route path="session/*" element={<SessionRoute />} />
      <Route path="delegations" element={<DelegationsRoute />} />
      <Route path="timeline" element={<TimelineRoute />} />
      <Route path="analytics" element={<AnalyticsRoute />} />
      <Route path="dashboard" element={<DashboardRoute />} />
      <Route path="projects" element={<ProjectsRoute />} />
      <Route path="projects/:projectId" element={<ChatRoute />} />
      <Route path="projects/:projectId/chat" element={<ChatRoute />} />
      <Route path="projects/:projectId/session/*" element={<SessionRoute />} />
      <Route path="projects/:projectId/delegations" element={<DelegationsRoute />} />
      <Route path="projects/:projectId/timeline" element={<TimelineRoute />} />
      <Route path="projects/:projectId/workspace" element={<WorkspaceRoute />} />
      <Route path="projects/:projectId/preview" element={<PreviewRoute />} />
      <Route path="agents" element={<AgentsRoute />} />
      <Route path="agents/:agentId" element={<ChatRoute />} />
      <Route path="agents/:agentId/chat" element={<ChatRoute />} />
      <Route path="agents/:agentId/session/*" element={<SessionRoute />} />
      <Route path="agents/:agentId/delegations" element={<DelegationsRoute />} />
      <Route path="agents/:agentId/timeline" element={<TimelineRoute />} />
      <Route path="agents/:agentId/workspace" element={<WorkspaceRoute />} />
      <Route path="teams" element={<TeamsRoute />} />
      <Route path="teams/:teamId" element={<ChatRoute />} />
      <Route path="teams/:teamId/chat" element={<ChatRoute />} />
      <Route path="teams/:teamId/session/*" element={<SessionRoute />} />
      <Route path="teams/:teamId/delegations" element={<DelegationsRoute />} />
      <Route path="teams/:teamId/timeline" element={<TimelineRoute />} />
      <Route path="teams/:teamId/workspace" element={<WorkspaceRoute />} />
      <Route path="teams/:teamId/org" element={<TeamOrgRoute />} />
      <Route path="team/:teamId" element={<TeamDetailRoute />} />
      <Route path="settings" element={<SettingsRoute />} />
      <Route path="skills" element={<SkillsRoute />} />
      <Route path="workspace" element={<WorkspaceRoute />} />
      <Route path="preview" element={<PreviewRoute />} />
      <Route path="logs" element={<LogsRoute />} />
      <Route path="laboratory" element={<LaboratoryRoute />} />
      <Route path="laboratory/session/*" element={<LaboratoryRoute />} />
      <Route path="laboratory/:experimentId" element={<LaboratoryRoute />} />
      <Route path="mcps" element={<McpRedirectRoute />} />
      <Route path="plugins" element={<PluginsRoute />} />
      <Route path="sessions" element={<SessionsRoute />} />
      <Route path="pipelines" element={<PipelinesRoute />} />
      <Route path="pipelines/:pipelineId" element={<PipelineRoute />} />
      <Route path="pipelines/:pipelineId/runs/:runId" element={<PipelineRoute />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Route>
  </Routes>;
}
