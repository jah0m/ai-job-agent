import {
  BriefcaseBusiness,
  ClipboardList,
  FileStack,
  Settings2,
  UserRound,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "岗位", icon: BriefcaseBusiness, end: true },
  { to: "/applications", label: "申请", icon: ClipboardList },
  { to: "/profile", label: "个人履历", icon: UserRound },
  { to: "/preferences", label: "求职偏好", icon: Settings2 },
  { to: "/packages", label: "材料包", icon: FileStack },
];

export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="primary-nav" aria-label="主导航">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          className={({ isActive }) =>
            `nav-item${isActive ? " is-active" : ""}`
          }
          end={end}
          key={to}
          onClick={onNavigate}
          to={to}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
