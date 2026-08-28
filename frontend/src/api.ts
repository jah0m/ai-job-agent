import type {
  ApplicationsResponse,
  DocumentPreview,
  JobDetail,
  JobsResponse,
  ProfileResponse,
  Session,
} from "./types";

let csrfToken = "";

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { detail?: string };
    return data.detail ?? `请求失败（${response.status}）`;
  } catch {
    return text || `请求失败（${response.status}）`;
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export async function postForm(
  path: string,
  values: Record<
    string,
    string | string[] | boolean | number | null | undefined
  >,
  files?: Record<string, File | null>,
): Promise<Response> {
  const form = new FormData();
  form.append("csrf_token", csrfToken);
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      raw.forEach((value) => {
        form.append(key, String(value));
      });
    } else if (typeof raw === "boolean") {
      if (raw) form.append(key, "on");
    } else {
      form.append(key, String(raw));
    }
  }
  for (const [key, file] of Object.entries(files ?? {})) {
    if (file) form.append(key, file);
  }
  const response = await fetch(path, { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export async function postUrlEncoded(
  path: string,
  values: Record<
    string,
    string | string[] | boolean | number | null | undefined
  >,
): Promise<Response> {
  const form = new URLSearchParams();
  form.set("csrf_token", csrfToken);
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      raw.forEach((value) => {
        form.append(key, String(value));
      });
    } else if (typeof raw === "boolean") {
      if (raw) form.append(key, "on");
    } else {
      form.append(key, String(raw));
    }
  }
  const response = await fetch(path, { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export async function loadSession(): Promise<Session> {
  const session = await getJson<Session>("/api/v1/session");
  csrfToken = session.csrf_token;
  return session;
}

export function getCsrfToken(): string {
  return csrfToken;
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export const api = {
  session: loadSession,
  jobs: (query = "") => getJson<JobsResponse>(`/api/v1/jobs${query}`),
  job: (id: string) =>
    getJson<JobDetail>(`/api/v1/jobs/${encodeURIComponent(id)}`),
  applications: () => getJson<ApplicationsResponse>("/api/v1/applications"),
  application: (id: string) =>
    getJson<{
      application: import("./types").Application;
      draft: import("./types").Draft;
      ai_prompt?: string;
    }>(`/api/v1/applications/${encodeURIComponent(id)}`),
  packages: () =>
    getJson<{ items: import("./types").PackageCatalogItem[] }>(
      "/api/v1/packages",
    ),
  profile: () => getJson<ProfileResponse>("/api/v1/profile"),
  preferences: () =>
    getJson<{ preferences: import("./types").Preferences }>(
      "/api/v1/preferences",
    ),
  draftPreview: (id: string, path: string) =>
    getJson<DocumentPreview>(
      `/api/v1/applications/${encodeURIComponent(id)}/draft/preview/${encodedPath(path)}`,
    ),
  packagePreview: (id: string, packageId: string, path: string) =>
    getJson<DocumentPreview>(
      `/api/v1/applications/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}/preview/${encodedPath(path)}`,
    ),
};
