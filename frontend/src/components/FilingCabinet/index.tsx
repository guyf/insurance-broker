import type { Policy } from "../../lib/types";
import { UploadButton } from "./UploadButton";
import { getRenewalStatus } from "./RenewalBadge";

interface Props {
  policies: Policy[];
  loading: boolean;
  onPolicyClick: (policy: Policy) => void;
  onUpload: (file: File) => Promise<void>;
  onRequote: (prompt: string) => void;
}

const DOCS_ROOT =
  "/Users/guy/Library/CloudStorage/GoogleDrive-guyfarley@gmail.com/My Drive/AI Broker/personal data";

const POLICY_TYPE_ORDER = ["home", "car", "life", "travel", "breakdown", "phone", "pet"];
const ASSET_TYPE_ORDER = ["car", "bike", "appliance"];

function pdfUrl(sourcePath: string): string {
  const full = `${DOCS_ROOT}/${sourcePath}`;
  return "file://" + full.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

function isAsset(policy: Policy): boolean {
  return !policy.source_path.startsWith("Insurance/");
}

function getQuoteType(policy: Policy): "home" | "motor" | "pet" | null {
  if (isAsset(policy)) return null;
  if (policy.policy_type === "home") return "home";
  if (policy.policy_type === "car") return "motor";
  if (policy.policy_type === "pet") return "pet";
  return null;
}

function renewalColor(renewalDate: string): string {
  const { status } = getRenewalStatus(renewalDate);
  if (status === "overdue") return "text-red-500";
  if (status === "expiring") return "text-amber-500";
  return "text-gray-400";
}

interface PolicyGroup {
  key: string;
  policy_type: string;
  property: string | null;
  docs: Policy[];
  primary: Policy;
}

function groupPolicies(policies: Policy[]): PolicyGroup[] {
  const map = new Map<string, Policy[]>();
  for (const p of policies) {
    const key = `${p.policy_type}|${p.property ?? ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].map(([key, docs]) => {
    const sorted = [...docs].sort((a, b) => a.filename.localeCompare(b.filename));
    const primary =
      sorted.find((d) => /insurance|cover/i.test(d.filename)) ?? sorted[0];
    return {
      key,
      policy_type: docs[0].policy_type,
      property: docs[0].property ?? null,
      docs: sorted,
      primary,
    };
  });
}

function PolicyGroupCard({
  group,
  onDocClick,
  onRequote,
}: {
  group: PolicyGroup;
  onDocClick: (policy: Policy) => void;
  onRequote: (prompt: string) => void;
}) {
  const { primary, docs } = group;
  const qt = getQuoteType(primary);
  const title = primary.filename.replace(/\.pdf$/i, "");
  const multiDoc = docs.length > 1;

  return (
    <div
      onClick={() => onDocClick(primary)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 leading-snug">{title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
            {primary.property && (
              <span className="capitalize">{primary.property.replace(/_/g, " ")}</span>
            )}
            {primary.premium && <span>£{primary.premium}/yr</span>}
            {primary.renewal_date && (
              <span className={renewalColor(primary.renewal_date)}>
                Renews {primary.renewal_date}
              </span>
            )}
          </div>
          {multiDoc ? (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {docs.map((doc) => (
                <li key={doc.source_path} className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDocClick(doc);
                    }}
                    className="text-[10px] text-gray-500 hover:text-gray-800 hover:underline truncate text-left"
                  >
                    ↳ {doc.filename.replace(/\.pdf$/i, "")}
                  </button>
                  <a
                    href={pdfUrl(doc.source_path)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 text-[10px] text-blue-400 hover:text-blue-600"
                  >
                    ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <a
              href={pdfUrl(primary.source_path)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-block text-[10px] text-blue-400 hover:text-blue-600 hover:underline"
            >
              View PDF ↗
            </a>
          )}
        </div>
        {qt && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequote(`Get me a new ${qt} insurance quote for ${title}`);
            }}
            className="flex-shrink-0 mt-0.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
          >
            Requote
          </button>
        )}
      </div>
    </div>
  );
}

function PolicySection({
  label,
  items,
  order,
  onPolicyClick,
  onRequote,
}: {
  label: string;
  items: Policy[];
  order: string[];
  onPolicyClick: (policy: Policy) => void;
  onRequote: (prompt: string) => void;
}) {
  const groups = groupPolicies(items);
  const typeMap = new Map<string, PolicyGroup[]>();
  for (const g of groups) {
    if (!typeMap.has(g.policy_type)) typeMap.set(g.policy_type, []);
    typeMap.get(g.policy_type)!.push(g);
  }
  const types = [...typeMap.keys()].sort(
    (a, b) =>
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
  );

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-2">
        {label}
      </p>
      <div className="flex flex-col gap-2">
        {types.map((type) => (
          <div key={type}>
            <p className="text-[10px] font-medium tracking-widest uppercase text-gray-300 mb-1">
              {type}
            </p>
            {typeMap.get(type)!.map((group) => (
              <div key={group.key} className="mb-1.5">
                <PolicyGroupCard
                  group={group}
                  onDocClick={onPolicyClick}
                  onRequote={onRequote}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilingCabinet({ policies, loading, onPolicyClick, onUpload, onRequote }: Props) {
  const policyItems = policies.filter((p) => !isAsset(p));
  const assetItems = policies.filter((p) => isAsset(p));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="h-14 flex-shrink-0 border-b border-gray-200 flex items-center justify-between px-4">
        <span className="text-lg font-semibold text-gray-900">Your Policies</span>
        <UploadButton onUpload={onUpload} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="py-6 text-xs text-gray-400 text-center">Loading…</div>
        ) : policies.length === 0 ? (
          <div className="py-6 text-xs text-gray-400 text-center leading-relaxed">
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
                order={POLICY_TYPE_ORDER}
                onPolicyClick={onPolicyClick}
                onRequote={onRequote}
              />
            )}
            {assetItems.length > 0 && (
              <PolicySection
                label="Assets"
                items={assetItems}
                order={ASSET_TYPE_ORDER}
                onPolicyClick={onPolicyClick}
                onRequote={onRequote}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
