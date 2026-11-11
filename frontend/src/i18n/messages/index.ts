import type { Locale } from "../locale";
import { applications } from "./applications";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { detail } from "./detail";
import { documentView } from "./document";
import { packages } from "./packages";
import { profile } from "./profile";
import { prompts } from "./prompts";
import { shell } from "./shell";
import { workflow } from "./workflow";

function build(locale: Locale) {
  return {
    common: common[locale],
    shell: shell[locale],
    workflow: workflow[locale],
    prompts: prompts[locale],
    dashboard: dashboard[locale],
    applications: applications[locale],
    detail: detail[locale],
    document: documentView[locale],
    packages: packages[locale],
    profile: profile[locale],
  };
}

export type Messages = ReturnType<typeof build>;

export const messages: Record<Locale, Messages> = {
  zh: build("zh"),
  ja: build("ja"),
  en: build("en"),
};
