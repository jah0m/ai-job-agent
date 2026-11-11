import { getActiveLocale } from "./i18n/locale";
import { messages } from "./i18n/messages";
import type { Job } from "./types";

function promptMessages() {
  return messages[getActiveLocale()].prompts;
}

export function aiPrompts() {
  const { jobSearch, profile, preferences } = promptMessages();
  return { jobSearch, profile, preferences };
}

export function buildJobAnalysisPrompt(
  job: Pick<Job, "id" | "title" | "company">,
): string {
  return promptMessages().jobAnalysis(job);
}

export function buildJobRefreshPrompt(job: Pick<Job, "id" | "url">): string {
  return promptMessages().jobRefresh(job);
}

export function buildApplicationPromptFallback(applicationId: string): string {
  return promptMessages().applicationFallback(applicationId);
}

export function buildApplicationDiscussionPrompt(
  applicationId: string,
): string {
  return promptMessages().applicationDiscussion(applicationId);
}
