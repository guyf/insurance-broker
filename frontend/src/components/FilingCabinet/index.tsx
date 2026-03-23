import type { Policy } from "../../lib/types";
import { PolicyCard } from "./PolicyCard";
import { UploadButton } from "./UploadButton";

interface Props {
  policies: Policy[];
  loading: boolean;
  onPolicyClick: (policy: Policy) => void;
  onUpload: (file: File) => Promise<void>;
}

const TYPE_ORDER = ["home", "car", "life", "travel", "breakdown", "phone", "pet", "asset"];

function groupPolicies(policies: Policy[]): Map<string, Policy[]> {
  const map = new Map<string, Policy[]>();
  for (const p of policies) {
    if (!map.has(p.policy_type)) map.set(p.policy_type, []);
    map.get(p.policy_type)!.push(p);
  }
  return map;
}

function sortedTypes(map: Map<string, Policy[]>): string[] {
  return [...map.keys()].sort(
    (a, b) =>
      (TYPE_ORDER.indexOf(a) === -1 ? 99 : TYPE_ORDER.indexOf(a)) -
      (TYPE_ORDER.indexOf(b) === -1 ? 99 : TYPE_ORDER.indexOf(b))
  );
}

export function FilingCabinet({ policies, loading, onPolicyClick, onUpload }: Props) {
  const grouped = groupPolicies(policies);
  const types = sortedTypes(grouped);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sidebar-text font-semibold text-sm tracking-tight">
            Insurance Broker
          </span>
        </div>
        <UploadButton onUpload={onUpload} />
      </div>

      <div className="px-3 pb-2 flex-shrink-0">
        <p className="text-[10px] font-medium tracking-widest uppercase text-sidebar-dim">
          Policies
        </p>
      </div>

      {/* Policy list */}
      <div className="flex-1 sidebar-scroll px-2 pb-4">
        {loading ? (
          <div className="px-3 py-6 text-xs text-sidebar-muted text-center">
            Loading…
          </div>
        ) : policies.length === 0 ? (
          <div className="px-3 py-6 text-xs text-sidebar-muted text-center leading-relaxed">
            No policies found.
            <br />
            Upload a PDF to get started.
          </div>
        ) : (
          types.map((type) => (
            <div key={type} className="mb-1">
              <p className="px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase text-sidebar-dim">
                {type}
              </p>
              {grouped.get(type)!.map((policy) => (
                <PolicyCard
                  key={policy.source_path + policy.filename}
                  policy={policy}
                  onClick={() => onPolicyClick(policy)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
