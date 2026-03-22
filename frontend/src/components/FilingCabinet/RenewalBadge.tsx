import type { RenewalStatus } from "../../lib/types";

interface Props {
  renewalDate: string;
  status: RenewalStatus;
  daysUntil: number;
}

const STATUS_CONFIG = {
  current: { dot: "bg-green-500", label: "text-green-700", text: "Current" },
  expiring: { dot: "bg-amber-500", label: "text-amber-700", text: "" },
  overdue: { dot: "bg-red-500", label: "text-red-700", text: "Overdue" },
};

export function RenewalBadge({ renewalDate, status, daysUntil }: Props) {
  const cfg = STATUS_CONFIG[status];
  const label =
    status === "expiring" ? `${daysUntil}d` : cfg.text;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.label}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span className="font-medium">{label}</span>
      <span className="text-gray-400 font-normal">{renewalDate}</span>
    </span>
  );
}

export function getRenewalStatus(
  renewalDate: string
): { status: RenewalStatus; daysUntil: number } {
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  ];

  let parsed: Date | null = null;
  for (const fmt of formats) {
    const m = renewalDate.match(fmt);
    if (m) {
      const year = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      parsed = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
      break;
    }
  }

  if (!parsed) return { status: "current", daysUntil: 999 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor(
    (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil < 0) return { status: "overdue", daysUntil };
  if (daysUntil <= 60) return { status: "expiring", daysUntil };
  return { status: "current", daysUntil };
}
