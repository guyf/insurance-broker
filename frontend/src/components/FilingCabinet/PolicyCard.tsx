import type { Policy } from "../../lib/types";
import { getRenewalStatus, RenewalBadge } from "./RenewalBadge";

interface Props {
  policy: Policy;
  onClick: () => void;
}

export function PolicyCard({ policy, onClick }: Props) {
  const renewal = policy.renewal_date ? getRenewalStatus(policy.renewal_date) : null;
  const name = policy.filename.replace(/\.pdf$/i, "");

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-md hover:bg-sidebar-hover transition-colors group"
    >
      <p className="text-sm text-sidebar-text leading-snug truncate group-hover:text-white transition-colors">
        {name}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        {policy.property && (
          <span className="text-[10px] text-sidebar-muted truncate">
            {policy.property.replace(/_/g, " ")}
          </span>
        )}
        {policy.premium && (
          <span className="text-[10px] text-sidebar-dim ml-auto whitespace-nowrap">
            £{policy.premium}/yr
          </span>
        )}
      </div>
      {renewal && policy.renewal_date && (
        <div className="mt-0.5">
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
