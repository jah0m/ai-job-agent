import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AppShell, EmptyState } from "./components/Layout";
import { TodayActionsPage } from "./components/TodayActions";
import { useI18n } from "./i18n";
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
  const { t } = useI18n();
  return (
    <EmptyState
      description={t.shell.notFoundDescription}
      title={t.shell.notFoundTitle}
      action={
        <a className="button button-primary" href="/">
          {t.shell.backToJobs}
        </a>
      }
    />
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    void api
      .session()
      .then(setSession)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : ""),
      );
  }, []);
  if (error !== null)
    return (
      <div className="loading-screen">
        <h1>AI Job Agent</h1>
        <p>{error || t.shell.cannotConnect}</p>
        <a className="button button-primary" href="/">
          {t.common.retry}
        </a>
      </div>
    );
  if (!session)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <span>{t.shell.connecting}</span>
      </div>
    );
  return (
    <BrowserRouter>
      <AppShell session={session}>
        <Routes>
          <Route element={<DashboardPage session={session} />} path="/" />
          <Route element={<TodayActionsPage />} path="/today" />
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
