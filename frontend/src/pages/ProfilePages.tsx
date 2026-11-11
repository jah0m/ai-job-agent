import { LoaderCircle, Plus, Save, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import { AiPromptButton } from "../components/AiPromptButton";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import { joinLines, labelFor, stringValue } from "../format";
import { currentMessages, useI18n } from "../i18n";
import { aiPrompts } from "../prompts";
import type { Candidate, Preferences, ProfileResponse } from "../types";

type Experience = {
  id: string;
  company: string;
  title_ja: string;
  title_en: string;
  start: string;
  end: string;
  product: string;
  facts: string;
};
type Education = {
  id: string;
  institution: string;
  degree: string;
  field: string;
  start: string;
  graduated: string;
};
type Language = {
  id: string;
  language: string;
  level: string;
  evidence: string;
  date: string;
};

function value(
  record: Record<string, unknown> | undefined,
  key: string,
): string {
  return stringValue(record?.[key]);
}

function completionTone(value: number): string {
  return value >= 80 ? "success" : value >= 50 ? "info" : "warning";
}

export function ProfilePage() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.profile;
  const navigate = useNavigate();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await api.profile());
    } catch (error) {
      showToast({
        title: m.loadFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, m, t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.loading}</span>
      </div>
    );
  if (!data)
    return (
      <EmptyState
        description={m.checkService}
        title={m.unavailable}
        action={<Button onClick={() => void load()}>{t.common.retry}</Button>}
      />
    );
  const candidate = data.candidate;
  const identity = candidate.identity ?? {};
  const contact = candidate.contact ?? {};
  const skills = (candidate.skills ?? []).map((item) =>
    typeof item === "string" ? item : stringValue(item.name ?? item.skill),
  );
  return (
    <div className="profile-page">
      <PageIntro
        description={m.description}
        title={m.title}
        actions={
          <>
            <AiPromptButton
              label={m.copyPrompt}
              prompt={aiPrompts().profile}
              successDescription={m.promptHint}
            />
            <Button onClick={() => navigate("/profile/edit")}>
              <UserRound size={15} />
              {m.edit}
            </Button>
          </>
        }
      />
      <div className="profile-layout">
        <div className="profile-main">
          <Panel className="profile-hero">
            <div className="profile-avatar">
              <span>
                {(
                  value(identity, "name_en") ||
                  value(identity, "name_ja") ||
                  "J"
                )
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
            </div>
            <div>
              <span className="page-eyebrow">{m.candidate}</span>
              <h2>
                {value(identity, "name_en") ||
                  value(identity, "name_ja") ||
                  m.noName}
              </h2>
              <p>
                {value(identity, "current_title") || m.noTitle}
                {value(identity, "current_employer")
                  ? ` · ${value(identity, "current_employer")}`
                  : ""}
              </p>
              <div className="profile-meta">
                <span>{value(identity, "location") || m.noLocation}</span>
                <span>
                  {value(identity, "employment_status") || m.noEmploymentStatus}
                </span>
              </div>
            </div>
          </Panel>
          <Panel className="profile-section">
            <div className="section-heading">
              <div>
                <h2>{m.summary}</h2>
                <p>{m.summaryHint}</p>
              </div>
            </div>
            <p className="profile-summary">
              {candidate.summary || m.noSummary}
            </p>
          </Panel>
          <Panel className="profile-section">
            <div className="section-heading">
              <div>
                <h2>{m.experience}</h2>
                <p>{m.experienceHint}</p>
              </div>
              <strong>{m.entries(candidate.experience?.length ?? 0)}</strong>
            </div>
            {candidate.experience?.length ? (
              <div className="experience-list">
                {candidate.experience.map((item) => (
                  <article
                    className="experience-item"
                    key={`${value(item, "company")}-${value(item, "start")}-${value(item, "title_en")}`}
                  >
                    <div className="experience-dot" />
                    <div>
                      <div className="experience-heading">
                        <div>
                          <h3>
                            {value(item, "title_ja") ||
                              value(item, "title_en") ||
                              m.noJobTitle}
                          </h3>
                          <p>
                            {value(item, "company") || m.noCompany}
                            {value(item, "product")
                              ? ` · ${value(item, "product")}`
                              : ""}
                          </p>
                        </div>
                        <span>
                          {value(item, "start")}
                          {value(item, "end")
                            ? ` — ${value(item, "end")}`
                            : value(item, "start")
                              ? ` — ${m.present}`
                              : ""}
                        </span>
                      </div>
                      {Array.isArray(item.facts) ? (
                        <ul>
                          {item.facts.map((fact) => (
                            <li
                              key={`${String(fact)}-${value(item, "company")}-${value(item, "start")}`}
                            >
                              {typeof fact === "string"
                                ? fact
                                : JSON.stringify(fact)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="section-empty">{m.noExperience}</div>
            )}
          </Panel>
        </div>
        <aside className="profile-side">
          <Panel className="completion-panel">
            <div
              className={`completion-ring ring-${completionTone(data.completion)}`}
              style={
                {
                  "--completion": `${data.completion * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <strong>{data.completion}%</strong>
            </div>
            <div>
              <h2>{m.completeness}</h2>
              <p>{m.completenessHint}</p>
            </div>
            <ul>
              {data.section_status.map((item) => (
                <li
                  className={item.complete ? "is-complete" : ""}
                  key={item.key}
                >
                  <span>
                    {labelFor(t.common.profileSections, item.key, item.label)}
                  </span>
                  <StatusBadge
                    label={item.complete ? m.filled : m.missing}
                    tone={item.complete ? "success" : "neutral"}
                  />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="contact-panel">
            <div className="section-heading">
              <h2>{m.contact}</h2>
            </div>
            <dl>
              <div>
                <dt>{m.fields.email}</dt>
                <dd>{value(contact, "email") || m.notFilled}</dd>
              </div>
              <div>
                <dt>{m.fields.phone}</dt>
                <dd>{value(contact, "phone") || m.notFilled}</dd>
              </div>
              <div>
                <dt>LinkedIn</dt>
                <dd>{value(contact, "linkedin") || m.notFilled}</dd>
              </div>
              <div>
                <dt>GitHub</dt>
                <dd>{value(contact, "github") || m.notFilled}</dd>
              </div>
            </dl>
          </Panel>
          <Panel className="profile-section profile-side-section">
            <div className="section-heading">
              <div>
                <h2>{m.education}</h2>
              </div>
              <strong>{m.entries(candidate.education?.length ?? 0)}</strong>
            </div>
            {candidate.education?.length ? (
              <div className="simple-grid">
                {candidate.education.map((item) => (
                  <article
                    key={`${value(item, "institution")}-${value(item, "start")}-${value(item, "degree")}`}
                  >
                    <h3>{value(item, "institution") || m.noInstitution}</h3>
                    <p>
                      {value(item, "degree")}
                      {value(item, "field") ? ` · ${value(item, "field")}` : ""}
                    </p>
                    <span>
                      {value(item, "start")}
                      {value(item, "graduated")
                        ? ` — ${value(item, "graduated")}`
                        : ""}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="section-empty">{m.noEducation}</div>
            )}
          </Panel>
          <Panel className="profile-section profile-side-section">
            <div className="section-heading">
              <div>
                <h2>{m.skillsAndLanguages}</h2>
              </div>
            </div>
            <div className="skill-cloud">
              {skills.length ? (
                skills.map((skill) => <span key={skill}>{skill}</span>)
              ) : (
                <span className="empty-chip">{m.noSkills}</span>
              )}
            </div>
            {candidate.languages?.length ? (
              <div className="language-grid">
                {candidate.languages.map((item) => (
                  <div
                    key={`${value(item, "language")}-${value(item, "date")}`}
                  >
                    <strong>{value(item, "language")}</strong>
                    <span>{value(item, "level") || m.noLevel}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
          <p className="private-data-note">{m.privateNote}</p>
        </aside>
      </div>
    </div>
  );
}

function blankExperience(): Experience {
  return {
    id: crypto.randomUUID(),
    company: "",
    title_ja: "",
    title_en: "",
    start: "",
    end: "",
    product: "",
    facts: "",
  };
}
function blankEducation(): Education {
  return {
    id: crypto.randomUUID(),
    institution: "",
    degree: "",
    field: "",
    start: "",
    graduated: "",
  };
}
function blankLanguage(): Language {
  return {
    id: crypto.randomUUID(),
    language: "",
    level: "",
    evidence: "",
    date: "",
  };
}

export function ProfileEditPage() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.profile;
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [educations, setEducations] = useState<Education[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .profile()
      .then((data) => {
        setCandidate(data.candidate);
        setExperiences(
          (data.candidate.experience ?? []).map((item) => ({
            id: crypto.randomUUID(),
            company: value(item, "company"),
            title_ja: value(item, "title_ja"),
            title_en: value(item, "title_en") || value(item, "title"),
            start: value(item, "start"),
            end: value(item, "end"),
            product: value(item, "product"),
            facts: joinLines(item.facts),
          })),
        );
        setEducations(
          (data.candidate.education ?? []).map((item) => ({
            id: crypto.randomUUID(),
            institution: value(item, "institution"),
            degree: value(item, "degree"),
            field: value(item, "field"),
            start: value(item, "start"),
            graduated: value(item, "graduated"),
          })),
        );
        setLanguages(
          (data.candidate.languages ?? []).map((item) => ({
            id: crypto.randomUUID(),
            language: value(item, "language"),
            level: value(item, "level"),
            evidence: value(item, "evidence"),
            date: value(item, "date"),
          })),
        );
      })
      .catch((error) =>
        showToast({
          title: currentMessages().profile.readFailed,
          description:
            error instanceof Error
              ? error.message
              : currentMessages().common.pleaseRetryLater,
        }),
      );
  }, [showToast]);
  if (!candidate)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.preparingForm}</span>
      </div>
    );
  const identity = candidate.identity ?? {};
  const contact = candidate.contact ?? {};
  const update = (section: "identity" | "contact", key: string, next: string) =>
    setCandidate((current) =>
      current
        ? {
            ...current,
            [section]: {
              ...(current[section] as Record<string, unknown>),
              [key]: next,
            },
          }
        : current,
    );
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const values: Record<string, string | number> = {
      name_ja: value(identity, "name_ja"),
      name_en: value(identity, "name_en"),
      current_title: value(identity, "current_title"),
      current_employer: value(identity, "current_employer"),
      location: value(identity, "location"),
      employment_status: value(identity, "employment_status"),
      email: value(contact, "email"),
      phone: value(contact, "phone"),
      linkedin: value(contact, "linkedin"),
      github: value(contact, "github"),
      summary: stringValue(candidate.summary),
      skills: joinLines(candidate.skills),
      experience_count: experiences.length,
      education_count: educations.length,
      language_count: languages.length,
    };
    experiences.forEach((item, index) => {
      Object.assign(values, {
        [`experience_company_${index}`]: item.company,
        [`experience_title_ja_${index}`]: item.title_ja,
        [`experience_title_en_${index}`]: item.title_en,
        [`experience_start_${index}`]: item.start,
        [`experience_end_${index}`]: item.end,
        [`experience_product_${index}`]: item.product,
        [`experience_facts_${index}`]: item.facts,
      });
    });
    educations.forEach((item, index) => {
      Object.assign(values, {
        [`education_institution_${index}`]: item.institution,
        [`education_degree_${index}`]: item.degree,
        [`education_field_${index}`]: item.field,
        [`education_start_${index}`]: item.start,
        [`education_graduated_${index}`]: item.graduated,
      });
    });
    languages.forEach((item, index) => {
      Object.assign(values, {
        [`language_name_${index}`]: item.language,
        [`language_level_${index}`]: item.level,
        [`language_evidence_${index}`]: item.evidence,
        [`language_date_${index}`]: item.date,
      });
    });
    try {
      await postUrlEncoded("/profile/edit", values);
      navigate("/profile");
    } catch (error) {
      showToast({
        title: m.saveFailed,
        description: error instanceof Error ? error.message : m.checkForm,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="editor-page">
      <PageIntro
        description={m.editDescription}
        title={m.edit}
        actions={
          <Button onClick={() => navigate("/profile")} variant="secondary">
            {t.common.cancel}
          </Button>
        }
      />
      <form className="editor-form-react" onSubmit={save}>
        <Panel className="editor-section">
          <h2>{m.identity}</h2>
          <div className="field-grid three-columns">
            {[
              "name_ja",
              "name_en",
              "current_title",
              "current_employer",
              "location",
              "employment_status",
            ].map((key) => (
              <label className="field-label" key={key}>
                <span>{m.fields[key]}</span>
                <input
                  onChange={(event) =>
                    update("identity", key, event.target.value)
                  }
                  value={value(identity, key)}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>{m.contact}</h2>
          <div className="field-grid two-columns">
            {["email", "phone", "linkedin", "github"].map((key) => (
              <label className="field-label" key={key}>
                <span>{m.fields[key]}</span>
                <input
                  onChange={(event) =>
                    update("contact", key, event.target.value)
                  }
                  type={key === "email" ? "email" : "text"}
                  value={value(contact, key)}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>{m.summaryAndSkills}</h2>
          <div className="field-grid two-columns">
            <label className="field-label">
              <span>{m.summary}</span>
              <textarea
                onChange={(event) =>
                  setCandidate((current) =>
                    current
                      ? { ...current, summary: event.target.value }
                      : current,
                  )
                }
                rows={5}
                value={stringValue(candidate.summary)}
              />
            </label>
            <label className="field-label">
              <span>{m.skillsPerLine}</span>
              <textarea
                onChange={(event) =>
                  setCandidate((current) =>
                    current
                      ? {
                          ...current,
                          skills: event.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        }
                      : current,
                  )
                }
                rows={5}
                value={joinLines(candidate.skills)}
              />
            </label>
          </div>
        </Panel>
        <RepeatSection
          title={m.experience}
          description={m.clearToDelete}
          onAdd={() => setExperiences((items) => [...items, blankExperience()])}
        >
          {experiences.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>{m.experienceItem(index + 1)}</legend>
              <div className="field-grid three-columns">
                {[
                  "company",
                  "title_ja",
                  "title_en",
                  "start",
                  "end",
                  "product",
                ].map((key) => (
                  <label className="field-label" key={key}>
                    <span>{m.experienceFields[key]}</span>
                    <input
                      onChange={(event) =>
                        setExperiences((items) =>
                          items.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, [key]: event.target.value }
                              : current,
                          ),
                        )
                      }
                      value={item[key as keyof Experience] as string}
                    />
                  </label>
                ))}
              </div>
              <label className="field-label">
                <span>{m.factsPerLine}</span>
                <textarea
                  onChange={(event) =>
                    setExperiences((items) =>
                      items.map((current, itemIndex) =>
                        itemIndex === index
                          ? { ...current, facts: event.target.value }
                          : current,
                      ),
                    )
                  }
                  rows={4}
                  value={item.facts}
                />
              </label>
            </fieldset>
          ))}
        </RepeatSection>
        <RepeatSection
          title={m.education}
          description={m.clearToDelete}
          onAdd={() => setEducations((items) => [...items, blankEducation()])}
        >
          {educations.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>{m.educationItem(index + 1)}</legend>
              <div className="field-grid three-columns">
                {["institution", "degree", "field", "start", "graduated"].map(
                  (key) => (
                    <label className="field-label" key={key}>
                      <span>{m.educationFields[key]}</span>
                      <input
                        onChange={(event) =>
                          setEducations((items) =>
                            items.map((current, itemIndex) =>
                              itemIndex === index
                                ? { ...current, [key]: event.target.value }
                                : current,
                            ),
                          )
                        }
                        value={item[key as keyof Education] as string}
                      />
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </RepeatSection>
        <RepeatSection
          title={m.languages}
          description={m.clearToDelete}
          onAdd={() => setLanguages((items) => [...items, blankLanguage()])}
        >
          {languages.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>{m.languageItem(index + 1)}</legend>
              <div className="field-grid four-columns">
                {["language", "level", "evidence", "date"].map((key) => (
                  <label className="field-label" key={key}>
                    <span>{m.languageFields[key]}</span>
                    <input
                      onChange={(event) =>
                        setLanguages((items) =>
                          items.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, [key]: event.target.value }
                              : current,
                          ),
                        )
                      }
                      value={item[key as keyof Language] as string}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </RepeatSection>
        <div className="editor-actions">
          <Button onClick={() => navigate("/profile")} variant="secondary">
            {t.common.cancel}
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            {m.saveProfile}
          </Button>
        </div>
      </form>
    </div>
  );
}

function RepeatSection({
  title,
  description,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Panel className="editor-section">
      <div className="editor-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Button onClick={onAdd} variant="secondary">
          <Plus size={15} />
          {t.profile.add}
        </Button>
      </div>
      <div className="repeat-list">{children}</div>
    </Panel>
  );
}

export function PreferencesPage() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.profile;
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const p = m.preferences;
  useEffect(() => {
    void api
      .preferences()
      .then((data) => setPreferences(data.preferences))
      .catch((error) =>
        showToast({
          title: currentMessages().profile.preferences.loadFailed,
          description:
            error instanceof Error
              ? error.message
              : currentMessages().common.pleaseRetryLater,
        }),
      );
  }, [showToast]);
  if (!preferences)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.preferences.loading}</span>
      </div>
    );
  const work = preferences.work_style ?? {};
  const compensation = preferences.compensation ?? {};
  const list = (
    key:
      | "target_roles"
      | "target_domains"
      | "locations"
      | "hard_constraints"
      | "soft_preferences"
      | "blacklisted_companies",
  ) => preferences[key] ?? [];
  return (
    <div className="preferences-page">
      <PageIntro
        description={m.preferences.description}
        title={m.preferences.title}
        actions={
          <>
            <AiPromptButton
              label={m.preferences.copyPrompt}
              prompt={aiPrompts().preferences}
              successDescription={m.promptHint}
            />
            <Button onClick={() => navigate("/preferences/edit")}>
              <SettingsIcon />
              {m.preferences.edit}
            </Button>
          </>
        }
      />
      <div className="preferences-layout">
        <Panel className="preference-section preference-primary">
          <div className="section-heading">
            <h2>{p.targets}</h2>
          </div>
          <PreferenceList label={p.targetRoles} values={list("target_roles")} />
          <PreferenceList
            label={p.targetDomains}
            values={list("target_domains")}
          />
          <PreferenceList label={p.locations} values={list("locations")} />
        </Panel>
        <Panel className="preference-section">
          <h2>{p.workStyle}</h2>
          <dl className="preference-rows">
            <div>
              <dt>{p.remotePreferred}</dt>
              <dd>
                {work.remote_preferred == null
                  ? p.notSet
                  : work.remote_preferred
                    ? p.yes
                    : p.no}
              </dd>
            </div>
            <div>
              <dt>{p.maxOfficeDays}</dt>
              <dd>
                {work.maximum_office_days_per_week == null
                  ? p.notSet
                  : p.days(work.maximum_office_days_per_week)}
              </dd>
            </div>
            <div>
              <dt>{p.autonomyPreferred}</dt>
              <dd>
                {work.autonomy_preferred == null
                  ? p.notSet
                  : work.autonomy_preferred
                    ? p.yes
                    : p.no}
              </dd>
            </div>
            <div>
              <dt>{p.focusTimePreferred}</dt>
              <dd>
                {work.focus_time_preferred == null
                  ? p.notSet
                  : work.focus_time_preferred
                    ? p.yes
                    : p.no}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel className="preference-section compensation-section">
          <h2>{p.compensation}</h2>
          <div className="compensation-values">
            <div>
              <span>{p.minimum}</span>
              <strong>
                {compensation.currency || ""} {compensation.minimum ?? p.notSet}
              </strong>
            </div>
            <div>
              <span>{p.target}</span>
              <strong>
                {compensation.currency || ""} {compensation.target ?? p.notSet}
              </strong>
            </div>
          </div>
        </Panel>
        <Panel className="preference-section constraints-section">
          <h2>{p.filters}</h2>
          <PreferenceList
            label={p.hardConstraints}
            values={list("hard_constraints")}
            bullet
          />
          <PreferenceList
            label={p.softPreferences}
            values={list("soft_preferences")}
            bullet
          />
          <PreferenceList
            label={p.blacklist}
            values={list("blacklisted_companies")}
          />
        </Panel>
      </div>
    </div>
  );
}

function SettingsIcon() {
  return <span className="button-symbol">⚙</span>;
}
function PreferenceList({
  label,
  values,
  bullet = false,
}: {
  label: string;
  values: string[];
  bullet?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="preference-group">
      <h3>{label}</h3>
      {values.length ? (
        bullet ? (
          <ul className="constraint-list">
            {values.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : (
          <div className="tag-list">
            {values.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
        )
      ) : (
        <p className="section-empty">
          {t.profile.preferences.emptyList(label)}
        </p>
      )}
    </div>
  );
}

export function PreferencesEditPage() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.profile;
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const p = m.preferences;
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .preferences()
      .then((data) => setPreferences(data.preferences))
      .catch((error) =>
        showToast({
          title: currentMessages().profile.readFailed,
          description:
            error instanceof Error
              ? error.message
              : currentMessages().common.pleaseRetryLater,
        }),
      );
  }, [showToast]);
  if (!preferences)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.preparingForm}</span>
      </div>
    );
  const work = preferences.work_style ?? {};
  const compensation = preferences.compensation ?? {};
  const setList = (
    key:
      | "target_roles"
      | "target_domains"
      | "locations"
      | "hard_constraints"
      | "soft_preferences"
      | "blacklisted_companies",
    raw: string,
  ) =>
    setPreferences((current) =>
      current
        ? {
            ...current,
            [key]: raw
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }
        : current,
    );
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const values: Record<string, string | number | boolean | null> = {
      target_roles: joinLines(preferences.target_roles),
      target_domains: joinLines(preferences.target_domains),
      locations: joinLines(preferences.locations),
      remote_preferred: Boolean(work.remote_preferred),
      autonomy_preferred: Boolean(work.autonomy_preferred),
      focus_time_preferred: Boolean(work.focus_time_preferred),
      maximum_office_days_per_week: work.maximum_office_days_per_week ?? null,
      compensation_currency: compensation.currency ?? "JPY",
      compensation_minimum: compensation.minimum ?? null,
      compensation_target: compensation.target ?? null,
      hard_constraints: joinLines(preferences.hard_constraints),
      soft_preferences: joinLines(preferences.soft_preferences),
      blacklisted_companies: joinLines(preferences.blacklisted_companies),
    };
    try {
      await postUrlEncoded("/preferences/edit", values);
      navigate("/preferences");
    } catch (error) {
      showToast({
        title: m.saveFailed,
        description: error instanceof Error ? error.message : m.checkForm,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="editor-page">
      <PageIntro
        description={p.editDescription}
        title={p.editTitle}
        actions={
          <Button onClick={() => navigate("/preferences")} variant="secondary">
            {t.common.cancel}
          </Button>
        }
      />
      <form className="editor-form-react" onSubmit={save}>
        <Panel className="editor-section">
          <h2>{p.targets}</h2>
          <div className="field-grid three-columns">
            <TextAreaField
              label={p.targetRolesPerLine}
              onChange={(value) => setList("target_roles", value)}
              rows={8}
              value={joinLines(preferences.target_roles)}
            />
            <TextAreaField
              label={p.targetDomainsPerLine}
              onChange={(value) => setList("target_domains", value)}
              rows={8}
              value={joinLines(preferences.target_domains)}
            />
            <TextAreaField
              label={p.locationsPerLine}
              onChange={(value) => setList("locations", value)}
              rows={8}
              value={joinLines(preferences.locations)}
            />
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>{p.workStyle}</h2>
          <div className="toggle-grid">
            <ToggleField
              checked={Boolean(work.remote_preferred)}
              label={p.remotePreferred}
              onChange={(checked) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        work_style: {
                          ...current.work_style,
                          remote_preferred: checked,
                        },
                      }
                    : current,
                )
              }
            />
            <ToggleField
              checked={Boolean(work.autonomy_preferred)}
              label={p.autonomyToggle}
              onChange={(checked) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        work_style: {
                          ...current.work_style,
                          autonomy_preferred: checked,
                        },
                      }
                    : current,
                )
              }
            />
            <ToggleField
              checked={Boolean(work.focus_time_preferred)}
              label={p.focusToggle}
              onChange={(checked) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        work_style: {
                          ...current.work_style,
                          focus_time_preferred: checked,
                        },
                      }
                    : current,
                )
              }
            />
            <label className="field-label">
              <span>{p.maxOfficeDaysField}</span>
              <input
                max={7}
                min={0}
                onChange={(event) =>
                  setPreferences((current) =>
                    current
                      ? {
                          ...current,
                          work_style: {
                            ...current.work_style,
                            maximum_office_days_per_week: event.target.value
                              ? Number(event.target.value)
                              : null,
                          },
                        }
                      : current,
                  )
                }
                type="number"
                value={work.maximum_office_days_per_week ?? ""}
              />
            </label>
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>{p.compensation}</h2>
          <div className="field-grid three-columns">
            <TextField
              label={p.currency}
              onChange={(value) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        compensation: {
                          ...current.compensation,
                          currency: value,
                        },
                      }
                    : current,
                )
              }
              value={compensation.currency ?? "JPY"}
            />
            <TextField
              label={p.minimum}
              onChange={(value) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        compensation: {
                          ...current.compensation,
                          minimum: value ? Number(value) : null,
                        },
                      }
                    : current,
                )
              }
              type="number"
              value={compensation.minimum ?? ""}
            />
            <TextField
              label={p.target}
              onChange={(value) =>
                setPreferences((current) =>
                  current
                    ? {
                        ...current,
                        compensation: {
                          ...current.compensation,
                          target: value ? Number(value) : null,
                        },
                      }
                    : current,
                )
              }
              type="number"
              value={compensation.target ?? ""}
            />
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>{p.filters}</h2>
          <div className="field-grid two-columns">
            <TextAreaField
              label={p.hardConstraintsPerLine}
              onChange={(value) => setList("hard_constraints", value)}
              rows={8}
              value={joinLines(preferences.hard_constraints)}
            />
            <TextAreaField
              label={p.softPreferencesPerLine}
              onChange={(value) => setList("soft_preferences", value)}
              rows={8}
              value={joinLines(preferences.soft_preferences)}
            />
            <TextAreaField
              label={p.blacklistPerLine}
              onChange={(value) => setList("blacklisted_companies", value)}
              rows={8}
              value={joinLines(preferences.blacklisted_companies)}
            />
          </div>
        </Panel>
        <div className="editor-actions">
          <Button onClick={() => navigate("/preferences")} variant="secondary">
            {t.common.cancel}
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            {p.save}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
function TextAreaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <textarea
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </label>
  );
}
function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="toggle-track">
        <span />
      </span>
      <span>{label}</span>
    </label>
  );
}
