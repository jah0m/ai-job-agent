import {
  BriefcaseBusiness,
  CalendarCheck2,
  ClipboardList,
  FileStack,
  Settings2,
  UserRound,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n";

const navItems = [
  { to: "/", key: "jobs", icon: BriefcaseBusiness, end: true },
  { to: "/today", key: "today", icon: CalendarCheck2 },
  { to: "/applications", key: "applications", icon: ClipboardList },
  { to: "/profile", key: "profile", icon: UserRound },
  { to: "/preferences", key: "preferences", icon: Settings2 },
  { to: "/packages", key: "packages", icon: FileStack },
] as const;

export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="primary-nav" aria-label={t.shell.nav.label}>
      {navItems.map(({ to, key, icon: Icon, ...item }) => (
        <NavLink
          className={({ isActive }) =>
            `nav-item${isActive ? " is-active" : ""}`
          }
          end={"end" in item ? item.end : undefined}
          key={to}
          onClick={onNavigate}
          to={to}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>{t.shell.nav[key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
