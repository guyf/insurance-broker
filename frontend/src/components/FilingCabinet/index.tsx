import type { Policy } from "../../lib/types";
import { PolicyCard } from "./PolicyCard";
import { UploadButton } from "./UploadButton";

interface Props {
  policies: Policy[];
  loading: boolean;
  onPolicyClick: (policy: Policy) => void;
  onUpload: (file: File) => Promise<void>;
}

const TYPE_ORDER = [
  "home",
  "car",
  "life",
  "travel",
  "breakdown",
  "phone",
  "pet",
  "asset",
];

function groupPolicies(policies: Policy[]): Map<string, Policy[]> {
  const map = new Map<string, Policy[]>();
  for (const p of policies) {
    const key = p.policy_type;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-panel-border flex items-center justify-between flex-shrink-0">
        <h2 className="font-cormorant text-navy text-base font-semibold tracking-wide">
          Filing Cabinet
        </h2>
        <UploadButton onUpload={onUpload} />
      </div>

      {/* Policy list */}
      <div className="flex-1 panel-scroll">
        {loading ? (
          <div className="px-4 py-8 text-sm text-gray-400 text-center">
            Loading policies…
          </div>
        ) : policies.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-400 text-center leading-relaxed">
            No policies found.
            <br />
            Upload a PDF to get started.
          </div>
        ) : (
          types.map((type) => (
            <div key={type}>
              <div className="px-4 py-2 bg-navy/5 border-b border-panel-border">
                <span className="text-[10px] font-semibold tracking-widest uppercase text-midtone/50">
                  {type}
                </span>
              </div>
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
