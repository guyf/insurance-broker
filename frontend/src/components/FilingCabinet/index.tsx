import type { Policy } from "../../lib/types";
import { PolicyCard } from "./PolicyCard";
import { UploadButton } from "./UploadButton";

interface Props {
  policies: Policy[];
  loading: boolean;
  onPolicyClick: (policy: Policy) => void;
  onUpload: (file: File) => Promise<void>;
}

const POLICY_TYPE_ORDER = ["home", "car", "life", "travel", "breakdown", "phone", "pet"];
const ASSET_TYPE_ORDER = ["car", "bike", "appliance"];

function isAsset(policy: Policy): boolean {
  return !policy.source_path.startsWith("Insurance/");
}

function groupByType(policies: Policy[]): Map<string, Policy[]> {
  const map = new Map<string, Policy[]>();
  for (const p of policies) {
    if (!map.has(p.policy_type)) map.set(p.policy_type, []);
    map.get(p.policy_type)!.push(p);
  }
  return map;
}

function sortedTypes(map: Map<string, Policy[]>, order: string[]): string[] {
  return [...map.keys()].sort(
    (a, b) =>
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
  );
}

function PolicySection({
  label,
  items,
  onPolicyClick,
}: {
  label: string;
  items: Policy[];
  onPolicyClick: (policy: Policy) => void;
}) {
  const order = label === "Policies" ? POLICY_TYPE_ORDER : ASSET_TYPE_ORDER;
  const grouped = groupByType(items);
  const types = sortedTypes(grouped, order);

  return (
    <div className="mb-2">
      <div className="px-3 py-2 flex-shrink-0">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-sidebar-dim">
          {label}
        </p>
      </div>
      {types.map((type) => (
        <div key={type} className="mb-1">
          <p className="px-3 py-1 text-[10px] font-medium tracking-widest uppercase text-sidebar-dim opacity-70">
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
      ))}
    </div>
  );
}

export function FilingCabinet({ policies, loading, onPolicyClick, onUpload }: Props) {
  const policyItems = policies.filter((p) => !isAsset(p));
  const assetItems = policies.filter((p) => isAsset(p));

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sidebar-text font-bold text-lg tracking-tight">
            Your Policies
          </span>
        </div>
        <UploadButton onUpload={onUpload} />
      </div>

      {/* Policy + Asset list */}
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
          <>
            {policyItems.length > 0 && (
              <PolicySection
                label="Policies"
                items={policyItems}
                onPolicyClick={onPolicyClick}
              />
            )}
            {assetItems.length > 0 && (
              <PolicySection
                label="Assets"
                items={assetItems}
                onPolicyClick={onPolicyClick}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
