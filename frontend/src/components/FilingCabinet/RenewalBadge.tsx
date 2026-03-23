import type { RenewalStatus } from "../../lib/types";

interface Props {
  renewalDate: string;
  status: RenewalStatus;
  daysUntil: number;
}

export function RenewalBadge({ renewalDate, status, daysUntil }: Props) {
  const config = {
    current: { dot: "bg-emerald-500", text: "text-emerald-500" },
    expiring: { dot: "bg-amber-400", text: "text-amber-400" },
    overdue: { dot: "bg-red-500", text: "text-red-400" },
  }[status];

  const label =
    status === "expiring"
      ? `${daysUntil}d`
      : status === "overdue"
      ? "Overdue"
      : "Current";

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${config.text}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {label}
      <span className="text-sidebar-dim">{renewalDate}</span>
    </span>
  );
}

export function getRenewalStatus(
  renewalDate: string
): { status: RenewalStatus; daysUntil: number } {
  let parsed: Date | null = null;

  const ddmmyyyy = renewalDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (ddmmyyyy) {
    const year =
      ddmmyyyy[3].length === 2 ? 2000 + parseInt(ddmmyyyy[3]) : parseInt(ddmmyyyy[3]);
    parsed = new Date(year, parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
  }

  if (!parsed || isNaN(parsed.getTime()))
    return { status: "current", daysUntil: 999 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor(
    (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil < 0) return { status: "overdue", daysUntil };
  if (daysUntil <= 60) return { status: "expiring", daysUntil };
  return { status: "current", daysUntil };
}
