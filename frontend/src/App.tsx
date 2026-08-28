import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AppShell, EmptyState } from "./components/Layout";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentEditPage, DocumentPreviewPage } from "./pages/DocumentPage";
import { PackagesPage } from "./pages/PackagesPage";
import {
  PreferencesEditPage,
  PreferencesPage,
  ProfileEditPage,
  ProfilePage,
} from "./pages/ProfilePages";
import type { Session } from "./types";
import "./styles.css";

function NotFound() {
  return (
    <EmptyState
      description="这个页面不存在，返回工作区继续操作。"
      title="页面不存在"
      action={
        <a className="button button-primary" href="/">
          返回岗位
        </a>
      }
    />
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api
      .session()
      .then(setSession)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "无法连接本地服务"),
      );
  }, []);
  if (error)
    return (
      <div className="loading-screen">
        <h1>AI Job Agent</h1>
        <p>{error}</p>
        <a className="button button-primary" href="/">
          重试
        </a>
      </div>
    );
  if (!session)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <span>正在连接本机工作区…</span>
      </div>
    );
  return (
    <BrowserRouter>
      <AppShell session={session}>
        <Routes>
          <Route element={<DashboardPage session={session} />} path="/" />
          <Route
            element={<ApplicationsPage session={session} />}
            path="/applications"
          />
          <Route
            element={<ApplicationDetailPage session={session} />}
            path="/applications/:applicationId"
          />
          <Route
            element={<DocumentEditPage />}
            path="/applications/:applicationId/draft/edit/*"
          />
          <Route
            element={<DocumentPreviewPage />}
            path="/applications/:applicationId/draft/preview/*"
          />
          <Route
            element={<DocumentPreviewPage />}
            path="/applications/:applicationId/packages/:packageId/preview/*"
          />
          <Route element={<PackagesPage />} path="/packages" />
          <Route element={<ProfilePage />} path="/profile" />
          <Route element={<ProfileEditPage />} path="/profile/edit" />
          <Route element={<PreferencesPage />} path="/preferences" />
          <Route element={<PreferencesEditPage />} path="/preferences/edit" />
          <Route element={<NotFound />} path="*" />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
