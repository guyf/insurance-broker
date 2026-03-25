import { useState } from "react";
import type { Policy } from "../../lib/types";
import { updatePolicyMetadata } from "../../lib/api";
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

const POLICY_TYPE_ORDER = ["home", "car", "life", "travel", "breakdown", "phone", "pet", "warranty", "other"];

const POLICY_TYPE_DISPLAY: Record<string, string> = { asset: "other" };
const ASSET_TYPE_ORDER = ["car", "bike", "appliance"];

function pdfUrl(sourcePath: string): string {
  const full = `${DOCS_ROOT}/${sourcePath}`;
  return "file://" + full.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

function isAsset(policy: Policy): boolean {
  if (policy.doc_type === "policy") return false;
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
  insured_entity: string | null;
  docs: Policy[];
  primary: Policy;
}

function groupPolicies(policies: Policy[]): PolicyGroup[] {
  const map = new Map<string, Policy[]>();
  for (const p of policies) {
    // Group purely by folder structure — insured_entity is display-only.
    // Insurance/Car/BMW i3/file.pdf  (4 parts) → "car|BMW i3"   (one group per vehicle)
    // Insurance/Travel/file.pdf      (3 parts) → "travel|"       (all travel docs together)
    // Cars/BMW i3/file.pdf           (3 parts) → "asset|BMW i3"  (group by asset subfolder)
    const parts = p.source_path.split("/");
    let key: string;
    if (isAsset(p)) {
      key = parts.length >= 2 ? `${p.policy_type}|${parts[1]}` : `${p.policy_type}|${parts[0]}`;
    } else {
      key = parts.length >= 4 ? `${p.policy_type}|${parts[2]}` : `${p.policy_type}|`;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].map(([key, docs]) => {
    const sorted = [...docs].sort((a, b) => a.filename.localeCompare(b.filename));
    const primary =
      sorted.find((d) => /schedule/i.test(d.filename)) ??
      sorted.find((d) => /insurance|cover/i.test(d.filename)) ??
      sorted[0];
    return {
      key,
      policy_type: docs[0].policy_type,
      insured_entity: docs[0].insured_entity ?? null,
      docs: sorted,
      primary,
    };
  });
}

const POLICY_FIELDS = [
  { key: "insured_entity", label: "Insured" },
  { key: "provider",       label: "Provider" },
  { key: "premium",        label: "Premium" },
  { key: "renewal_date",   label: "Renews" },
] as const;

const INVOICE_FIELDS = [
  { key: "asset_name",  label: "Asset" },
  { key: "asset_value", label: "Value" },
] as const;

const OTHER_FIELDS = [
  { key: "insured_entity", label: "Insured" },
] as const;

type CardFieldKey = "insured_entity" | "provider" | "premium" | "renewal_date" | "asset_name" | "asset_value";

function cardFields(doc_type: string | null): readonly { key: CardFieldKey; label: string }[] {
  if (doc_type === "invoice") return INVOICE_FIELDS;
  if (doc_type === "other") return OTHER_FIELDS;
  return POLICY_FIELDS; // "policy" or null (default)
}

function PolicyGroupCard({
  group,
  customName,
  onDocClick,
  onRequote,
  onRename,
  onUpdateField,
}: {
  group: PolicyGroup;
  customName: string | undefined;
  onDocClick: (policy: Policy) => void;
  onRequote: (prompt: string) => void;
  onRename: (name: string) => void;
  onUpdateField: (sourcePaths: string[], field: string, value: string) => Promise<void>;
}) {
  const { primary, docs } = group;
  const qt = getQuoteType(primary);
  const autoTitle = primary.filename.replace(/\.pdf$/i, "");
  const title = customName ?? autoTitle;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const asset = isAsset(primary);
  const fields = cardFields(primary.doc_type);

  function bestField(field: keyof typeof primary): string | null {
    for (const doc of docs) {
      const v = doc[field] as string | null | undefined;
      if (v) return v;
    }
    return null;
  }

  const [localValues, setLocalValues] = useState<Record<CardFieldKey, string | null>>({
    insured_entity: group.insured_entity ?? bestField("insured_entity"),
    provider: bestField("provider"),
    premium: bestField("premium"),
    renewal_date: bestField("renewal_date"),
    asset_name: bestField("asset_name"),
    asset_value: bestField("asset_value"),
  });
  const [editingField, setEditingField] = useState<CardFieldKey | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");

  function startTitleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setTitleDraft(title);
    setEditingTitle(true);
  }

  function commitTitleEdit() {
    const trimmed = titleDraft.trim();
    onRename(trimmed || autoTitle);
    setEditingTitle(false);
  }

  function startFieldEdit(e: React.MouseEvent, field: CardFieldKey) {
    e.stopPropagation();
    setFieldDraft(localValues[field] ?? "");
    setEditingField(field);
  }

  async function commitFieldEdit(field: CardFieldKey) {
    const newValue = fieldDraft.trim();
    setEditingField(null);
    setLocalValues((prev) => ({ ...prev, [field]: newValue || null }));
    const sourcePaths = docs.map((d) => d.source_path);
    await onUpdateField(sourcePaths, field, newValue);
  }

  function fieldDisplay(field: CardFieldKey, value: string | null): string {
    if (!value) return "Unknown";
    if (field === "premium") return `£${value}/yr`;
    if (field === "asset_value") return `£${value}`;
    return value;
  }

  function fieldTextClass(field: CardFieldKey, value: string | null): string {
    if (!value) return "text-gray-300 italic";
    if (field === "renewal_date") return renewalColor(value);
    return "text-gray-600";
  }

  return (
    <div
      onClick={() => onDocClick(primary)}
      className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
        asset
          ? "border-dashed border-gray-300 bg-gray-50 hover:border-gray-400"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitleEdit();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm font-medium text-gray-800 leading-snug bg-transparent border-b border-blue-400 outline-none"
            />
          ) : (
            <p
              onDoubleClick={startTitleEdit}
              className="text-sm font-medium text-gray-800 leading-snug group/title"
              title="Double-click to rename"
            >
              {title}
              <span className="ml-1 opacity-0 group-hover/title:opacity-40 text-[10px] cursor-text select-none">✎</span>
            </p>
          )}
          <dl className="mt-1.5 mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            {fields.map(({ key, label }) => {
              const value = localValues[key];
              const isEditing = editingField === key;
              return (
                <div key={key} className="contents">
                  <dt className="text-gray-400 self-center">{label}</dt>
                  <dd>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={fieldDraft}
                        onChange={(e) => setFieldDraft(e.target.value)}
                        onBlur={() => commitFieldEdit(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitFieldEdit(key);
                          if (e.key === "Escape") setEditingField(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-transparent border-b border-blue-400 outline-none text-gray-600"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => startFieldEdit(e, key)}
                        className={`${fieldTextClass(key, value)} group/field cursor-text`}
                      >
                        {fieldDisplay(key, value)}
                        <span className="ml-0.5 opacity-0 group-hover/field:opacity-40 text-[9px] select-none">✎</span>
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
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
        </div>
        {qt && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const parts: string[] = [`Get me a new ${qt} insurance quote for ${title}`];
              if (localValues.insured_entity) parts.push(`(${localValues.insured_entity})`);
              if (localValues.premium) parts.push(`— current premium £${localValues.premium}/yr`);
              if (localValues.provider) parts.push(`with ${localValues.provider}`);
              if (localValues.renewal_date) parts.push(`renewing ${localValues.renewal_date}`);
              onRequote(parts.join(" "));
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
  groupNames,
  onPolicyClick,
  onRequote,
  onRename,
  onUpdateField,
}: {
  label: string;
  items: Policy[];
  order: string[];
  groupNames: Record<string, string>;
  onPolicyClick: (policy: Policy) => void;
  onRequote: (prompt: string) => void;
  onRename: (key: string, name: string) => void;
  onUpdateField: (sourcePaths: string[], field: string, value: string) => Promise<void>;
}) {
  const groups = groupPolicies(items);
  const typeMap = new Map<string, PolicyGroup[]>();
  for (const g of groups) {
    if (!typeMap.has(g.policy_type)) typeMap.set(g.policy_type, []);
    typeMap.get(g.policy_type)!.push(g);
  }
  const types = [...typeMap.keys()].sort((a, b) => {
    const da = POLICY_TYPE_DISPLAY[a] ?? a;
    const db = POLICY_TYPE_DISPLAY[b] ?? b;
    return (order.indexOf(da) === -1 ? 99 : order.indexOf(da)) -
           (order.indexOf(db) === -1 ? 99 : order.indexOf(db));
  });

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-2">
        {label}
      </p>
      <div className="flex flex-col gap-2">
        {types.map((type) => (
          <div key={type}>
            <p className="text-[10px] font-medium tracking-widest uppercase text-gray-300 mb-1">
              {POLICY_TYPE_DISPLAY[type] ?? type}
            </p>
            {typeMap.get(type)!.map((group) => (
              <div key={group.key} className="mb-1.5">
                <PolicyGroupCard
                  group={group}
                  customName={groupNames[group.key]}
                  onDocClick={onPolicyClick}
                  onRequote={onRequote}
                  onRename={(name) => onRename(group.key, name)}
                  onUpdateField={onUpdateField}
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
  const relevant = policies.filter((p) => p.doc_type !== "other");
  const policyItems = relevant.filter((p) => !isAsset(p));
  const assetItems = relevant.filter((p) => isAsset(p));

  const [groupNames, setGroupNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("insurance-group-names") ?? "{}"); }
    catch { return {}; }
  });

  function handleRename(key: string, name: string) {
    const next = { ...groupNames, [key]: name };
    setGroupNames(next);
    localStorage.setItem("insurance-group-names", JSON.stringify(next));
  }

  async function handleUpdateField(sourcePaths: string[], field: string, value: string) {
    await updatePolicyMetadata(sourcePaths, { [field]: value });
  }

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
                groupNames={groupNames}
                onPolicyClick={onPolicyClick}
                onRequote={onRequote}
                onRename={handleRename}
                onUpdateField={handleUpdateField}
              />
            )}
            {assetItems.length > 0 && (
              <PolicySection
                label="Assets"
                items={assetItems}
                order={ASSET_TYPE_ORDER}
                groupNames={groupNames}
                onPolicyClick={onPolicyClick}
                onRequote={onRequote}
                onRename={handleRename}
                onUpdateField={handleUpdateField}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
