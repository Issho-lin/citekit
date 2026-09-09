import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { AgentPage } from "./pages/AgentPage";
import { CallLogsPage } from "./pages/CallLogsPage";
import { EvalPage } from "./pages/EvalPage";
import { KbDataPage } from "./pages/KbDataPage";
import { KbDetailPage } from "./pages/KbDetailPage";
import { KbImportPage } from "./pages/KbImportPage";
import { KnowledgeBasesPage } from "./pages/KnowledgeBasesPage";
import { McpDetailPage } from "./pages/McpDetailPage";
import { McpPage } from "./pages/McpPage";
import { NewKbPage } from "./pages/NewKbPage";
import { NewMcpPage } from "./pages/NewMcpPage";
import { NewToolPage } from "./pages/NewToolPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ToolDetailPage } from "./pages/ToolDetailPage";
import { ToolsPage } from "./pages/ToolsPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<WorkbenchPage />} />
        <Route path="/kb" element={<KnowledgeBasesPage />} />
        <Route path="/kb/new" element={<NewKbPage />} />
        <Route path="/kb/:kbId/import" element={<KbImportPage />} />
        <Route path="/kb/:kbId/data/:sourceId" element={<KbDataPage />} />
        <Route path="/kb/:kbId" element={<KbDetailPage />} />
        <Route path="/indexes" element={<Navigate to="/kb" replace />} />
        <Route path="/indexes/new" element={<Navigate to="/kb" replace />} />
        <Route path="/indexes/:sliceId" element={<Navigate to="/kb" replace />} />
        <Route path="/slices" element={<Navigate to="/kb" replace />} />
        <Route path="/slices/:sliceId" element={<Navigate to="/kb" replace />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/tools/new" element={<NewToolPage />} />
        <Route path="/tools/:toolId" element={<ToolDetailPage />} />
        <Route path="/mcp" element={<McpPage />} />
        <Route path="/mcp/new" element={<NewMcpPage />} />
        <Route path="/mcp/:endpointId" element={<McpDetailPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/calls" element={<CallLogsPage />} />
        <Route path="/eval" element={<EvalPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
