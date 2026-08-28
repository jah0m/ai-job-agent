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
import { joinLines, stringValue } from "../format";
import { AI_PROMPTS } from "../prompts";
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
  const navigate = useNavigate();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await api.profile());
    } catch (error) {
      showToast({
        title: "个人履历加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取个人履历…</span>
      </div>
    );
  if (!data)
    return (
      <EmptyState
        description="请确认本地服务正在运行。"
        title="暂时无法读取个人履历"
        action={<Button onClick={() => void load()}>重试</Button>}
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
        description="用于生成材料与辅助岗位匹配的本机私有资料"
        title="个人履历"
        actions={
          <>
            <AiPromptButton
              label="AI 生成履历"
              prompt={AI_PROMPTS.profile}
              successDescription="请粘贴到 Codex 中开始生成。"
            />
            <Button onClick={() => navigate("/profile/edit")}>
              <UserRound size={15} />
              编辑个人履历
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
              <span className="page-eyebrow">候选人</span>
              <h2>
                {value(identity, "name_en") ||
                  value(identity, "name_ja") ||
                  "尚未填写姓名"}
              </h2>
              <p>
                {value(identity, "current_title") || "尚未填写当前职位"}
                {value(identity, "current_employer")
                  ? ` · ${value(identity, "current_employer")}`
                  : ""}
              </p>
              <div className="profile-meta">
                <span>{value(identity, "location") || "所在地未填写"}</span>
                <span>
                  {value(identity, "employment_status") || "就业状态未填写"}
                </span>
              </div>
            </div>
          </Panel>
          <Panel className="profile-section">
            <div className="section-heading">
              <div>
                <h2>个人简介</h2>
                <p>一句话说明你的方向和优势。</p>
              </div>
            </div>
            <p className="profile-summary">
              {candidate.summary || "尚未记录个人简介。"}
            </p>
          </Panel>
          <Panel className="profile-section">
            <div className="section-heading">
              <div>
                <h2>工作经历</h2>
                <p>基于事实的经历会用于起草申请材料。</p>
              </div>
              <strong>{candidate.experience?.length ?? 0} 段</strong>
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
                              "职位未填写"}
                          </h3>
                          <p>
                            {value(item, "company") || "公司未填写"}
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
                              ? " — 至今"
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
              <div className="section-empty">尚未记录工作经历。</div>
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
              <h2>资料完整度</h2>
              <p>完整资料有助于生成更准确的履歴書。</p>
            </div>
            <ul>
              {data.section_status.map((item) => (
                <li
                  className={item.complete ? "is-complete" : ""}
                  key={item.key}
                >
                  <span>{item.label}</span>
                  <StatusBadge
                    label={item.complete ? "已填写" : "待补充"}
                    tone={item.complete ? "success" : "neutral"}
                  />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="contact-panel">
            <div className="section-heading">
              <h2>联系方式</h2>
            </div>
            <dl>
              <div>
                <dt>邮箱</dt>
                <dd>{value(contact, "email") || "未填写"}</dd>
              </div>
              <div>
                <dt>电话</dt>
                <dd>{value(contact, "phone") || "未填写"}</dd>
              </div>
              <div>
                <dt>LinkedIn</dt>
                <dd>{value(contact, "linkedin") || "未填写"}</dd>
              </div>
              <div>
                <dt>GitHub</dt>
                <dd>{value(contact, "github") || "未填写"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel className="profile-section profile-side-section">
            <div className="section-heading">
              <div>
                <h2>教育经历</h2>
              </div>
              <strong>{candidate.education?.length ?? 0} 段</strong>
            </div>
            {candidate.education?.length ? (
              <div className="simple-grid">
                {candidate.education.map((item) => (
                  <article
                    key={`${value(item, "institution")}-${value(item, "start")}-${value(item, "degree")}`}
                  >
                    <h3>{value(item, "institution") || "院校未填写"}</h3>
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
              <div className="section-empty">尚未记录教育经历。</div>
            )}
          </Panel>
          <Panel className="profile-section profile-side-section">
            <div className="section-heading">
              <div>
                <h2>技能与语言</h2>
              </div>
            </div>
            <div className="skill-cloud">
              {skills.length ? (
                skills.map((skill) => <span key={skill}>{skill}</span>)
              ) : (
                <span className="empty-chip">尚未记录技能</span>
              )}
            </div>
            {candidate.languages?.length ? (
              <div className="language-grid">
                {candidate.languages.map((item) => (
                  <div
                    key={`${value(item, "language")}-${value(item, "date")}`}
                  >
                    <strong>{value(item, "language")}</strong>
                    <span>{value(item, "level") || "水平未填写"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
          <p className="private-data-note">这些资料只从本机私有工作区读取。</p>
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
          title: "读取失败",
          description: error instanceof Error ? error.message : "请稍后重试",
        }),
      );
  }, [showToast]);
  if (!candidate)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在准备编辑表单…</span>
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
        title: "保存失败",
        description: error instanceof Error ? error.message : "请检查表单",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="editor-page">
      <PageIntro
        description="保存后会写入本机私有资料。"
        title="编辑个人履历"
        actions={
          <Button onClick={() => navigate("/profile")} variant="secondary">
            取消
          </Button>
        }
      />
      <form className="editor-form-react" onSubmit={save}>
        <Panel className="editor-section">
          <h2>基本信息</h2>
          <div className="field-grid three-columns">
            {[
              ["name_ja", "中文 / 日文姓名"],
              ["name_en", "英文姓名"],
              ["current_title", "当前职位"],
              ["current_employer", "当前公司"],
              ["location", "所在地"],
              ["employment_status", "就业状态"],
            ].map(([key, label]) => (
              <label className="field-label" key={key}>
                <span>{label}</span>
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
          <h2>联系方式</h2>
          <div className="field-grid two-columns">
            {[
              ["email", "邮箱"],
              ["phone", "电话"],
              ["linkedin", "LinkedIn"],
              ["github", "GitHub"],
            ].map(([key, label]) => (
              <label className="field-label" key={key}>
                <span>{label}</span>
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
          <h2>个人简介与技能</h2>
          <div className="field-grid two-columns">
            <label className="field-label">
              <span>个人简介</span>
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
              <span>技能（每行一项）</span>
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
          title="工作经历"
          description="清空整条记录即可删除。"
          onAdd={() => setExperiences((items) => [...items, blankExperience()])}
        >
          {experiences.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>经历 {index + 1}</legend>
              <div className="field-grid three-columns">
                {[
                  ["company", "公司"],
                  ["title_ja", "职位（日文）"],
                  ["title_en", "职位（英文）"],
                  ["start", "开始时间"],
                  ["end", "结束时间"],
                  ["product", "项目 / 产品"],
                ].map(([key, label]) => (
                  <label className="field-label" key={key}>
                    <span>{label}</span>
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
                <span>事实与成果（每行一项）</span>
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
          title="教育经历"
          description="清空整条记录即可删除。"
          onAdd={() => setEducations((items) => [...items, blankEducation()])}
        >
          {educations.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>教育 {index + 1}</legend>
              <div className="field-grid three-columns">
                {[
                  ["institution", "院校"],
                  ["degree", "学位"],
                  ["field", "专业"],
                  ["start", "开始时间"],
                  ["graduated", "毕业时间"],
                ].map(([key, label]) => (
                  <label className="field-label" key={key}>
                    <span>{label}</span>
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
                ))}
              </div>
            </fieldset>
          ))}
        </RepeatSection>
        <RepeatSection
          title="语言能力"
          description="清空整条记录即可删除。"
          onAdd={() => setLanguages((items) => [...items, blankLanguage()])}
        >
          {languages.map((item, index) => (
            <fieldset className="repeat-record" key={item.id}>
              <legend>语言 {index + 1}</legend>
              <div className="field-grid four-columns">
                {[
                  ["language", "语言"],
                  ["level", "水平"],
                  ["evidence", "依据"],
                  ["date", "日期"],
                ].map(([key, label]) => (
                  <label className="field-label" key={key}>
                    <span>{label}</span>
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
            取消
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            保存个人履历
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
  return (
    <Panel className="editor-section">
      <div className="editor-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Button onClick={onAdd} variant="secondary">
          <Plus size={15} />
          新增
        </Button>
      </div>
      <div className="repeat-list">{children}</div>
    </Panel>
  );
}

export function PreferencesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  useEffect(() => {
    void api
      .preferences()
      .then((data) => setPreferences(data.preferences))
      .catch((error) =>
        showToast({
          title: "求职偏好加载失败",
          description: error instanceof Error ? error.message : "请稍后重试",
        }),
      );
  }, [showToast]);
  if (!preferences)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取求职偏好…</span>
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
      | "soft_preferences",
  ) => preferences[key] ?? [];
  return (
    <div className="preferences-page">
      <PageIntro
        description="用于搜索、筛选与岗位匹配的本地条件"
        title="求职偏好"
        actions={
          <>
            <AiPromptButton
              label="AI 生成偏好"
              prompt={AI_PROMPTS.preferences}
              successDescription="请粘贴到 Codex 中开始生成。"
            />
            <Button onClick={() => navigate("/preferences/edit")}>
              <SettingsIcon />
              编辑偏好
            </Button>
          </>
        }
      />
      <div className="preferences-layout">
        <Panel className="preference-section preference-primary">
          <div className="section-heading">
            <h2>目标方向</h2>
          </div>
          <PreferenceList label="目标职位" values={list("target_roles")} />
          <PreferenceList label="目标领域" values={list("target_domains")} />
          <PreferenceList label="目标地区" values={list("locations")} />
        </Panel>
        <Panel className="preference-section">
          <h2>工作方式</h2>
          <dl className="preference-rows">
            <div>
              <dt>偏好远程办公</dt>
              <dd>
                {work.remote_preferred == null
                  ? "未设置"
                  : work.remote_preferred
                    ? "是"
                    : "否"}
              </dd>
            </div>
            <div>
              <dt>每周最多到岗</dt>
              <dd>
                {work.maximum_office_days_per_week == null
                  ? "未设置"
                  : `${work.maximum_office_days_per_week} 天`}
              </dd>
            </div>
            <div>
              <dt>偏好自主性</dt>
              <dd>
                {work.autonomy_preferred == null
                  ? "未设置"
                  : work.autonomy_preferred
                    ? "是"
                    : "否"}
              </dd>
            </div>
            <div>
              <dt>重视专注时间</dt>
              <dd>
                {work.focus_time_preferred == null
                  ? "未设置"
                  : work.focus_time_preferred
                    ? "是"
                    : "否"}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel className="preference-section compensation-section">
          <h2>期望薪资</h2>
          <div className="compensation-values">
            <div>
              <span>最低</span>
              <strong>
                {compensation.currency || ""} {compensation.minimum ?? "未设置"}
              </strong>
            </div>
            <div>
              <span>目标</span>
              <strong>
                {compensation.currency || ""} {compensation.target ?? "未设置"}
              </strong>
            </div>
          </div>
        </Panel>
        <Panel className="preference-section constraints-section">
          <h2>筛选条件</h2>
          <PreferenceList
            label="不可接受条件"
            values={list("hard_constraints")}
            bullet
          />
          <PreferenceList
            label="加分项"
            values={list("soft_preferences")}
            bullet
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
        <p className="section-empty">尚未设置{label}。</p>
      )}
    </div>
  );
}

export function PreferencesEditPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .preferences()
      .then((data) => setPreferences(data.preferences))
      .catch((error) =>
        showToast({
          title: "读取失败",
          description: error instanceof Error ? error.message : "请稍后重试",
        }),
      );
  }, [showToast]);
  if (!preferences)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在准备编辑表单…</span>
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
      | "soft_preferences",
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
    };
    try {
      await postUrlEncoded("/preferences/edit", values);
      navigate("/preferences");
    } catch (error) {
      showToast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "请检查表单",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="editor-page">
      <PageIntro
        description="这些条件用于后续搜索、筛选和岗位判断。"
        title="编辑求职偏好"
        actions={
          <Button onClick={() => navigate("/preferences")} variant="secondary">
            取消
          </Button>
        }
      />
      <form className="editor-form-react" onSubmit={save}>
        <Panel className="editor-section">
          <h2>目标方向</h2>
          <div className="field-grid three-columns">
            <TextAreaField
              label="目标职位（每行一项）"
              onChange={(value) => setList("target_roles", value)}
              rows={8}
              value={joinLines(preferences.target_roles)}
            />
            <TextAreaField
              label="目标领域（每行一项）"
              onChange={(value) => setList("target_domains", value)}
              rows={8}
              value={joinLines(preferences.target_domains)}
            />
            <TextAreaField
              label="目标地区（每行一项）"
              onChange={(value) => setList("locations", value)}
              rows={8}
              value={joinLines(preferences.locations)}
            />
          </div>
        </Panel>
        <Panel className="editor-section">
          <h2>工作方式</h2>
          <div className="toggle-grid">
            <ToggleField
              checked={Boolean(work.remote_preferred)}
              label="偏好远程办公"
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
              label="偏好较高自主性"
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
              label="重视专注工作时间"
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
              <span>每周最多到岗天数</span>
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
          <h2>期望薪资</h2>
          <div className="field-grid three-columns">
            <TextField
              label="币种"
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
              label="最低"
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
              label="目标"
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
          <h2>筛选条件</h2>
          <div className="field-grid two-columns">
            <TextAreaField
              label="不可接受条件（每行一项）"
              onChange={(value) => setList("hard_constraints", value)}
              rows={8}
              value={joinLines(preferences.hard_constraints)}
            />
            <TextAreaField
              label="加分项（每行一项）"
              onChange={(value) => setList("soft_preferences", value)}
              rows={8}
              value={joinLines(preferences.soft_preferences)}
            />
          </div>
        </Panel>
        <div className="editor-actions">
          <Button onClick={() => navigate("/preferences")} variant="secondary">
            取消
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            保存求职偏好
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
