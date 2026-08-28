export type Labels = Record<string, string>;

export type FileEntry = {
  path: string;
  role?: string;
  purpose?: string;
  origin?: string;
  size?: number;
  sha256?: string;
};

export type Evaluation = {
  recommendation: "pursue" | "consider" | "skip" | string;
  summary: string;
  strengths: string[];
  gaps: {
    disqualifying: string[];
    learnable: string[];
    unclear: string[];
  };
  hard_constraints: { result: string; reasons: string[] };
  questions: string[];
  confidence: string;
  source_limitations: string;
  analyzed_at?: string;
  stale?: boolean;
  stale_reasons?: string[];
};

export type Job = {
  id: string;
  portal: string;
  external_id?: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  posted_at?: string;
  status: string;
  first_seen_at?: string;
  last_seen_at: string;
  salary?: string;
  rating?: number | null;
  evaluation?: Evaluation | null;
};

export type JobDetail = Job & {
  description?: string;
  tags: string[];
  application?: {
    id: string;
    company: string;
    role: string;
    status: string;
  } | null;
  match_analysis?: Evaluation | null;
  notes?: string;
};

export type Draft = {
  draft_id: string;
  status: string;
  revision: number;
  base_package_id?: string | null;
  relative_path: string;
  created_at?: string;
  updated_at?: string;
  label?: string | null;
  files: FileEntry[];
  deliverable_files: FileEntry[];
  validation?: ValidationResult;
  summary?: Record<string, unknown>;
};

export type ValidationResult = {
  ok?: boolean;
  valid?: boolean;
  errors?: string[];
  warnings?: string[];
  [key: string]: unknown;
};

export type PackageReadiness = {
  integrity_ok: boolean;
  integrity_errors: string[];
  has_deliverables: boolean;
  deliverables: FileEntry[];
  sources: FileEntry[];
  content: ValidationResult;
  ready_for_exact_files: boolean;
  ready_for_source_only: boolean;
};

export type MaterialPackage = {
  id: string;
  package_id?: string;
  label?: string | null;
  created_at: string;
  locked_at?: string;
  source_draft_id?: string | null;
  source_draft_revision?: number | null;
  template_revision?: string | null;
  files: FileEntry[];
  readiness: PackageReadiness;
  is_submitted?: boolean;
  can_delete?: boolean;
};

export type PackageCatalogItem = {
  application: ApplicationListItem;
  package: MaterialPackage;
};

export type Submission = {
  id: number;
  package_id?: string | null;
  evidence_level: string;
  submitted_at?: string;
  recorded_at: string;
  channel: string;
  external_reference?: string | null;
  note?: string | null;
  relative_path?: string;
  files: FileEntry[] | string[];
};

export type Application = {
  id: string;
  company: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  job_url?: string | null;
  draft: Record<string, unknown>;
  packages: MaterialPackage[];
  submissions: Submission[];
  events: { type: string; created_at: string; data: Record<string, unknown> }[];
  ai_prompt?: string;
};

export type ApplicationListItem = {
  id: string;
  company: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  job_url?: string | null;
  draft_status?: string | null;
  draft_revision?: number | null;
};

export type Candidate = {
  identity?: Record<string, string | null | undefined>;
  contact?: Record<string, string | null | undefined>;
  summary?: string;
  experience?: Record<string, unknown>[];
  education?: Record<string, unknown>[];
  skills?: (string | Record<string, unknown>)[];
  languages?: Record<string, unknown>[];
  [key: string]: unknown;
};

export type Preferences = {
  target_roles?: string[];
  target_domains?: string[];
  locations?: string[];
  work_style?: {
    remote_preferred?: boolean | null;
    maximum_office_days_per_week?: number | null;
    autonomy_preferred?: boolean | null;
    focus_time_preferred?: boolean | null;
  };
  compensation?: {
    currency?: string;
    minimum?: number | string | null;
    target?: number | string | null;
  };
  hard_constraints?: string[];
  soft_preferences?: string[];
  [key: string]: unknown;
};

export type Session = {
  csrf_token: string;
  status_labels: Labels;
  application_labels: Labels;
  draft_status_labels: Labels;
  profile_sections: { label: string; key: string }[];
};

export type JobsResponse = {
  jobs: Job[];
  portals: string[];
  selected_job?: JobDetail | null;
  filters: {
    q: string;
    portal: string;
    status: string;
    recommendation: string;
    rating: string;
  };
  counts: Record<string, number>;
  total: number;
};

export type ApplicationsResponse = {
  applications: ApplicationListItem[];
  columns: {
    status: string;
    label: string;
    items: ApplicationListItem[];
    manual: boolean;
  }[];
  archived: ApplicationListItem[];
};

export type ProfileResponse = {
  candidate: Candidate;
  section_status: { label: string; key: string; complete: boolean }[];
  completion: number;
};

export type DocumentPreview = {
  application: Application;
  draft?: Draft | null;
  package?: MaterialPackage | null;
  is_draft: boolean;
  relative_path: string;
  document_title: string;
  content: string;
  blocks: MarkdownBlock[];
};

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph" | "quote" | "notice"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };
