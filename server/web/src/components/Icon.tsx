import type { CSSProperties } from "react";

export type IconName = "toggle" | "lock" | "logout" | "plus" | "close" | "users" | "apps" | "check";

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Glifos extraídos do design-graph (get_full_jsx do componente Icon). Só "toggle"
// veio indexado pelo protótipo; o resto segue a mesma convenção confirmada
// (viewBox 24x24, stroke=currentColor, cantos arredondados) mas não são originais
// do protótipo — confira contra o design-graph se/quando a tela que usa esses
// ícones for reindexada com o glifo real.
const paths: Record<IconName, JSX.Element> = {
  toggle: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  apps: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  check: (
    <path d="M20 6 9 17l-5-5" />
  ),
};

export function Icon({ name, size = 16, strokeWidth = 2, fill = false, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
