import type { ToggleStatus } from "../lib/toggleLeaves";

interface StatusRingProps {
  status: ToggleStatus;
  size?: number;
}

export function StatusRing({ status, size = 18 }: StatusRingProps) {
  const color = status === "green" ? "var(--accent)" : status === "red" ? "var(--danger)" : "var(--warn)";
  const title = status === "green" ? "Active" : status === "red" ? "Branch off" : "Blocked by a parent";

  return (
    <span className="status-ring" style={{ color, width: size, height: size }} title={title}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        {status === "green" && <path d="M8.5 12l2.5 2.5 4.5-5" />}
        {status === "amber" && <line x1="8" y1="12" x2="16" y2="12" />}
        {status === "red" && (
          <>
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </>
        )}
      </svg>
    </span>
  );
}
