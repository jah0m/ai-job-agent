import { describe, expect, it } from "vitest";
import { groupNextActions, localDate } from "./nextActions";
import { preparationState } from "./preparation";
import type {
  Application,
  ApplicationListItem,
  Draft,
  MaterialPackage,
} from "./types";

const draft: Draft = {
  draft_id: "example-draft",
  status: "working",
  revision: 2,
  relative_path: "",
  files: [{ path: "shokumu-keirekisho.md" }],
  deliverable_files: [{ path: "final.pdf" }],
  validation: { ready: true },
};
const material: MaterialPackage = {
  id: "example-package",
  created_at: "2026-09-01",
  source_draft_id: draft.draft_id,
  source_draft_revision: draft.revision,
  files: [],
  readiness: {
    integrity_ok: true,
    integrity_errors: [],
    has_deliverables: true,
    deliverables: [],
    sources: [],
    content: { valid: true },
    ready_for_exact_files: true,
    ready_for_source_only: true,
  },
};
const application: Application = {
  id: "example",
  company: "Example KK",
  role: "Engineer",
  status: "draft",
  created_at: "2026-09-01",
  updated_at: "2026-09-01",
  draft: {},
  packages: [material],
  submissions: [],
  events: [],
  next_action: { title: "", due_date: null, completed_at: null, revision: 0 },
};

describe("material preparation", () => {
  it("reaches three prepared items before any external submission", () => {
    expect(preparationState(application, draft).steps).toEqual([
      true,
      true,
      true,
    ]);
  });
  it("does not treat an existing invalid source as checked", () => {
    const state = preparationState(application, {
      ...draft,
      validation: { ready: false, errors: ["Incomplete"] },
    });
    expect(state.hasSource).toBe(true);
    expect(state.steps).toEqual([false, true, false]);
    expect(
      preparationState(application, {
        ...draft,
        validation: { ready: true, placeholders: ["Unconfirmed"] },
      }).contentReady,
    ).toBe(false);
  });
  it("requires the current draft revision, not a historical or unrelated package", () => {
    expect(
      preparationState(application, { ...draft, revision: 3 }).steps[2],
    ).toBe(false);
    expect(
      preparationState(application, { ...draft, draft_id: "other" }).steps[2],
    ).toBe(false);
    expect(
      preparationState({ ...application, packages: [] }, draft).steps[2],
    ).toBe(false);
  });
  it("does not mark missing or unverified source files ready", () => {
    expect(
      preparationState(application, { ...draft, files: [] }).contentReady,
    ).toBe(false);
    expect(
      preparationState(application, { ...draft, validation: undefined })
        .contentReady,
    ).toBe(false);
    expect(
      preparationState(application, { ...draft, deliverable_files: [] })
        .steps[1],
    ).toBe(false);
  });
  it("does not accept a damaged package as the final version", () => {
    const damaged = {
      ...material,
      readiness: { ...material.readiness, ready_for_exact_files: false },
    };
    expect(
      preparationState({ ...application, packages: [damaged] }, draft).steps[2],
    ).toBe(false);
  });
});

function withAction(
  id: string,
  due: string | null,
  status = "draft",
  completed = false,
): ApplicationListItem {
  return {
    ...application,
    id,
    status,
    next_action: {
      title: id,
      due_date: due,
      completed_at: completed ? "2026-09-05" : null,
      revision: 1,
    },
  };
}

describe("today actions", () => {
  it("groups calendar dates and excludes completed and closed applications", () => {
    const groups = groupNextActions(
      [
        withAction("today", "2026-09-05"),
        withAction("late", "2026-09-04"),
        withAction("older", "2026-09-01"),
        withAction("later", "2026-09-06"),
        withAction("undated", null),
        withAction("complete", "2026-09-05", "draft", true),
        ...["closed", "rejected", "withdrawn"].map((status) =>
          withAction(status, "2026-09-05", status),
        ),
      ],
      "2026-09-05",
    );
    expect(groups.overdue.map((item) => item.id)).toEqual(["older", "late"]);
    expect(groups.dueToday.map((item) => item.id)).toEqual(["today"]);
    expect(groups.upcoming.map((item) => item.id)).toEqual(["later"]);
    expect(groups.undated.map((item) => item.id)).toEqual(["undated"]);
    expect(groups.unset).toBe(1);
  });
  it("moves today's action to overdue after the local day changes", () => {
    const item = withAction("follow-up", "2026-12-31");
    expect(groupNextActions([item], "2026-12-31").dueToday).toHaveLength(1);
    expect(groupNextActions([item], "2027-01-01").overdue).toHaveLength(1);
    expect(localDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(localDate(new Date(2027, 0, 1, 0, 1))).toBe("2027-01-01");
  });
});
