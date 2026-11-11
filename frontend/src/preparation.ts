import type { Application, Draft } from "./types";

export function preparationState(application: Application, draft: Draft) {
  const hasSource = draft.files.some(
    (file) => file.path === "shokumu-keirekisho.md",
  );
  const validation = draft.validation;
  const contentReady =
    hasSource &&
    Boolean(validation?.ready || validation?.valid) &&
    !["errors", "missing", "placeholders"].some(
      (key) => Array.isArray(validation?.[key]) && validation[key].length > 0,
    );
  const hasDeliverables = draft.deliverable_files.length > 0;
  const currentPackage = application.packages.find(
    (item) =>
      item.source_draft_id === draft.draft_id &&
      item.source_draft_revision === draft.revision &&
      item.readiness.ready_for_exact_files,
  );
  return {
    hasSource,
    contentReady,
    hasDeliverables,
    currentPackage,
    steps: [
      contentReady,
      hasDeliverables,
      contentReady && Boolean(currentPackage),
    ],
  };
}
