import type { Policy } from "../../lib/types";
import { getRenewalStatus, RenewalBadge } from "./RenewalBadge";

const POLICY_TYPE_LABELS: Record<string, string> = {
  car: "Motor",
  home: "Home",
  life: "Life",
  travel: "Travel",
  phone: "Phone",
  breakdown: "Breakdown",
  pet: "Pet",
  asset: "Asset",
};

interface Props {
  policy: Policy;
  onClick: () => void;
}

export function PolicyCard({ policy, onClick }: Props) {
  const label = POLICY_TYPE_LABELS[policy.policy_type] ?? policy.policy_type;
  const renewal = policy.renewal_date
    ? getRenewalStatus(policy.renewal_date)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-panel-border hover:bg-brass/5 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-midtone/60">
          {label}
          {policy.property && (
            <span className="ml-1 text-brass/70">
              · {policy.property.replace(/_/g, " ")}
            </span>
          )}
        </span>
        {policy.premium && (
          <span className="text-xs text-midtone font-medium whitespace-nowrap">
            £{policy.premium}/yr
          </span>
        )}
      </div>

      <p className="mt-0.5 text-sm text-navy font-medium leading-snug truncate group-hover:text-midtone transition-colors">
        {policy.filename}
      </p>

      {renewal && policy.renewal_date && (
        <div className="mt-1">
          <RenewalBadge
            renewalDate={policy.renewal_date}
            status={renewal.status}
            daysUntil={renewal.daysUntil}
          />
        </div>
      )}
    </button>
  );
}
