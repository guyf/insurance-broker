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

function PolicyCard({
  policy,
  onClick,
  onRequote,
}: {
  policy: Policy;
  onClick: () => void;
  onRequote: (prompt: string) => void;
}) {
  const qt = getQuoteType(policy);
  const title = policy.filename.replace(/\.pdf$/i, "");

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 leading-snug">{title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
            {policy.property && (
              <span className="capitalize">{policy.property.replace(/_/g, " ")}</span>
            )}
            {policy.premium && <span>£{policy.premium}/yr</span>}
            {policy.renewal_date && (
              <span className={renewalColor(policy.renewal_date)}>
                Renews {policy.renewal_date}
              </span>
            )}
          </div>
          <a
            href={pdfUrl(policy.source_path)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-block text-[10px] text-blue-400 hover:text-blue-600 hover:underline"
          >
            View PDF ↗
          </a>
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
  const map = new Map<string, Policy[]>();
  for (const p of items) {
    if (!map.has(p.policy_type)) map.set(p.policy_type, []);
    map.get(p.policy_type)!.push(p);
  }
  const types = [...map.keys()].sort(
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
            {map.get(type)!.map((policy) => (
              <div key={policy.source_path + policy.filename} className="mb-1.5">
                <PolicyCard
                  policy={policy}
                  onClick={() => onPolicyClick(policy)}
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
