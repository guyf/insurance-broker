import { useEffect, useRef, useState } from "react";
import { getCoverageAnalysis, identifyPolicy, refreshCoverageAnalysis } from "../../lib/api";
import { updateBusinessName, type BusinessInfo } from "../../lib/auth";
import type { CoverageAnalysis, Policy, RiskAnalysis } from "../../lib/types";

// ---------------------------------------------------------------------------
// Risk definitions — comprehensive SME list, ported from xero-insurance's
// CompanyPanel.tsx (the same list the coverage-analysis prompt uses server-side).
// ---------------------------------------------------------------------------

interface RiskDef {
  id: string;
  name: string;
  category: string;
  description: string;
  legalNote?: string;
}

const RISKS: RiskDef[] = [
  { id: "el", name: "Employers' Liability", category: "Liability", description: "Claims from employees injured or made ill through work.", legalNote: "Legally required if you have employees" },
  { id: "pl", name: "Public Liability", category: "Liability", description: "Third-party claims for injury or property damage." },
  { id: "pi", name: "Professional Indemnity", category: "Liability", description: "Negligence claims from clients for errors in advice or services." },
  { id: "product", name: "Product Liability", category: "Liability", description: "Claims arising from products you manufacture, supply, or sell." },
  { id: "do", name: "Directors & Officers", category: "Liability", description: "Personal liability of directors and officers for management decisions." },
  { id: "property", name: "Commercial Property", category: "Property", description: "Damage to premises, equipment, and stock." },
  { id: "bi", name: "Business Interruption", category: "Property", description: "Lost income if you cannot trade due to a covered event." },
  { id: "transit", name: "Goods in Transit", category: "Property", description: "Stock or equipment lost or damaged during delivery or transport." },
  { id: "cyber", name: "Cyber Liability", category: "Cyber", description: "Data breaches, ransomware, and IT business interruption." },
  { id: "keyperson", name: "Key Person Insurance", category: "People", description: "Financial protection if a key individual is unable to work." },
];

const POLICY_TYPE_TO_RISK: Record<string, string> = {
  employers_liability: "el",
  public_liability: "pl",
  professional_indemnity: "pi",
  cyber: "cyber",
  cyber_liability: "cyber",
  commercial_property: "property",
  property: "property",
  business_interruption: "bi",
  product_liability: "product",
  goods_in_transit: "transit",
  transit: "transit",
  directors_officers: "do",
  directors_and_officers: "do",
  key_person: "keyperson",
  keyperson: "keyperson",
};

const RISK_NAMES: Record<string, string> = Object.fromEntries(RISKS.map((r) => [r.id, r.name]));

/** Turns a fresh coverage-analysis result into a readable chat message, so
 * "Analyse Policies" surfaces what it found without a separate Claude call —
 * the analysis already ran server-side, this just formats what came back. */
function buildAnalysisSummary(analysis: CoverageAnalysis): string {
  const covered = Object.entries(analysis);
  const lines = [
    `**Coverage analysis complete** — found ${covered.length} risk${covered.length === 1 ? "" : "s"} covered in your uploaded policies:`,
    "",
  ];
  for (const [riskId, data] of covered) {
    lines.push(`- **${RISK_NAMES[riskId] ?? riskId}**: ${data.summary}`);
    if (data.exclusions.length > 0) lines.push(`  Exclusions: ${data.exclusions.join(", ")}`);
    if (data.concerns.length > 0) lines.push(`  ⚠ ${data.concerns.join("; ")}`);
  }

  const gaps = RISKS.filter((r) => !analysis[r.id]);
  if (gaps.length > 0) {
    lines.push("", `No coverage found for: ${gaps.map((r) => r.name).join(", ")}.`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

function riskIdsForPolicy(policy: Policy): string[] {
  const types = policy.policy_types ?? (policy.policy_type ? [policy.policy_type] : []);
  return [...new Set(types.map((t) => POLICY_TYPE_TO_RISK[t]).filter((id): id is string => !!id))];
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BusinessCard
// ---------------------------------------------------------------------------

function BusinessCard({
  business,
  onLogout,
  onNameUpdate,
}: {
  business: BusinessInfo;
  onLogout: () => void;
  onNameUpdate: (name: string) => void;
}) {
  const f = business.financials;
  const items = [
    { label: "Revenue", value: fmt(f?.revenue) },
    { label: "Employees", value: f?.employees != null ? String(f.employees) : "—" },
    { label: "Fixed Assets", value: fmt(f?.fixed_assets) },
    { label: "Industry", value: f?.industry ?? "—" },
  ];
  const connectedProviders = new Set(business.connections.map((c) => c.provider));

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(business.business?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === business.business?.name) {
      setIsEditingName(false);
      setNameInput(business.business?.name ?? "");
      return;
    }
    setSavingName(true);
    try {
      await updateBusinessName(trimmed);
      onNameUpdate(trimmed);
    } catch {
      setNameInput(business.business?.name ?? "");
    } finally {
      setSavingName(false);
      setIsEditingName(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-900 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={nameInput}
              disabled={savingName}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setNameInput(business.business?.name ?? "");
                  setIsEditingName(false);
                }
              }}
              className="w-full bg-slate-800 text-white text-base font-semibold font-display rounded px-1.5 py-0.5 -mx-1.5 focus:outline-none focus:ring-1 focus:ring-white/40"
              placeholder="Company name"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-left w-full group"
              title="Click to edit company name"
            >
              <h1 className="text-base font-semibold font-display text-white truncate group-hover:underline decoration-white/40">
                {business.business?.name || "+ Add company name"}
              </h1>
            </button>
          )}
          {f?.source && (
            <p className="text-sm text-slate-400 capitalize">via {f.source}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {business.user.email && (
            <span className="text-sm text-slate-400 truncate max-w-[140px]" title={business.user.email}>
              {business.user.email}
            </span>
          )}
          <button
            onClick={onLogout}
            className="text-sm text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            Log out
          </button>
        </div>
      </div>
      <div className="px-3 py-2.5 grid grid-cols-4 gap-x-3 gap-y-2">
        {items.map(({ label, value }) => (
          <div key={label}>
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-sm font-medium text-slate-800 truncate">{value}</div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2.5 flex gap-1.5">
        {["xero", "quickbooks"].map((provider) => (
          <span
            key={provider}
            className={`text-xs font-medium uppercase tracking-wide rounded px-1.5 py-0.5 ${
              connectedProviders.has(provider)
                ? "bg-accent-tint text-accent"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {provider} {connectedProviders.has(provider) ? "connected" : "not connected"}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PolicyDocCard — "Your Policies" section
// ---------------------------------------------------------------------------

function PolicyDocCard({ policy, onSendMessage }: { policy: Policy; onSendMessage?: (msg: string) => void }) {
  const riskIds = riskIdsForPolicy(policy);
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 flex items-start gap-2">
      <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onSendMessage?.(`Tell me about my ${policy.filename}`)}
          className="text-sm font-medium text-accent hover:text-accent/80 underline truncate block text-left w-full"
          title={policy.filename}
        >
          {policy.filename}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {policy.provider && <span className="text-sm text-slate-500">{policy.provider}</span>}
          {policy.premium && <span className="text-sm text-slate-400">· {policy.premium}</span>}
          {policy.renewal_date && <span className="text-sm text-slate-400">· Renews {policy.renewal_date}</span>}
        </div>
        {riskIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {riskIds.map((id) => (
              <span key={id} className="text-xs bg-accent-tint text-accent rounded px-1.5 py-0.5 font-medium uppercase">
                {id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RiskBox — "Risks Covered" section
// ---------------------------------------------------------------------------

function RiskBox({
  risk,
  policy,
  isDuplicate,
  onSendMessage,
  business,
  analysisData,
}: {
  risk: RiskDef;
  policy?: Policy;
  isDuplicate?: boolean;
  onSendMessage?: (msg: string) => void;
  business: BusinessInfo;
  analysisData?: RiskAnalysis;
}) {
  const isCovered = !!policy || !!analysisData;
  const f = business.financials;
  const revenue = fmt(f?.revenue);
  const employees = f?.employees != null ? String(f.employees) : "unknown";
  const payroll = fmt(f?.payroll);
  const industry = f?.industry ?? "unknown";

  function quoteMessage(): string {
    const base = `Revenue: ${revenue}, Employees: ${employees}, Industry: ${industry}`;
    switch (risk.id) {
      case "el": return `Please get me an Employers' Liability quote. ${base}, Annual Payroll: ${payroll}.`;
      case "pl": return `Please get me a Public Liability quote. ${base}.`;
      case "pi": return `Please get me a Professional Indemnity quote. ${base}, Profession: ${industry}.`;
      case "cyber": return `Please get me a Cyber Liability quote. ${base}.`;
      case "product": return `Please explain Product Liability insurance and give an indicative quote. ${base}.`;
      case "do": return `Please explain Directors & Officers insurance and give an indicative price range. ${base}.`;
      case "property": return `Please explain Commercial Property insurance and give an indicative price range. Fixed assets: ${fmt(f?.fixed_assets)}.`;
      case "bi": return `Please explain Business Interruption insurance and give an indicative price range. ${base}.`;
      case "transit": return `Please explain Goods in Transit insurance and give an indicative price range. ${base}.`;
      case "keyperson": return `Please explain Key Person Insurance and give an indicative price range. ${base}.`;
      default: return `Please give me information and an indicative quote for ${risk.name}. ${base}.`;
    }
  }

  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${isCovered ? "border-accent/40" : "border-slate-200"}`}>
      <div className={`px-3 py-2 border-b ${isCovered ? "bg-accent-tint border-accent/20" : "bg-slate-50 border-slate-200"}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{risk.name}</h3>
          {isCovered ? (
            <span className={`text-sm font-medium flex items-center gap-0.5 flex-shrink-0 ml-1 ${isDuplicate ? "text-amber-600" : "text-accent"}`}>
              <CheckIcon className="w-3 h-3" />
              {isDuplicate ? "Duplicate" : "Covered"}
            </span>
          ) : (
            <span className="text-sm font-medium text-primary flex items-center gap-0.5 flex-shrink-0 ml-1">
              <CrossIcon className="w-3 h-3" />
              Not covered
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 text-sm space-y-1.5">
        {isCovered ? (
          <>
            {analysisData ? (
              <>
                <p className="text-slate-700 leading-snug">{analysisData.summary}</p>
                {analysisData.exclusions.length > 0 && (
                  <p className="text-amber-600 leading-snug">
                    <span className="font-medium">Exclusions:</span> {analysisData.exclusions.join(", ")}
                  </p>
                )}
                {analysisData.concerns.map((c, i) => (
                  <p key={i} className="text-amber-600 leading-snug">⚠ {c}</p>
                ))}
              </>
            ) : policy ? (
              <>
                {(policy.renewal_date || policy.premium) && (
                  <div className="flex gap-3">
                    {policy.premium && (
                      <div>
                        <div className="text-slate-400">Premium</div>
                        <div className="font-medium text-slate-800">{policy.premium}</div>
                      </div>
                    )}
                    {policy.renewal_date && (
                      <div>
                        <div className="text-slate-400">Renews</div>
                        <div className="font-medium text-accent flex items-center gap-0.5">
                          <CheckIcon className="w-3 h-3" />
                          {policy.renewal_date}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-slate-400 italic leading-snug">
                  Uploaded — click "Analyse Policies" above for a detailed summary.
                </p>
              </>
            ) : null}
            {policy && (
              <button
                onClick={() => onSendMessage?.(`Tell me about my ${policy.filename}`)}
                className="text-accent hover:text-accent/80 underline truncate block max-w-full text-left"
                title={policy.filename}
              >
                {policy.filename}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-slate-500 leading-snug">{risk.description}</p>
            {risk.legalNote && <p className="text-amber-600 font-medium">⚠ {risk.legalNote}</p>}
            <button
              onClick={() => onSendMessage?.(quoteMessage())}
              className="w-full text-sm bg-primary text-white rounded-full py-2 hover:bg-primary/90 transition-colors font-medium mt-1"
            >
              Get Quote
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BusinessPanel
// ---------------------------------------------------------------------------

interface Props {
  business: BusinessInfo;
  policies: Policy[];
  onUpload: (file: File) => Promise<void>;
  onSendMessage?: (msg: string) => void;
  onLogout: () => void;
  onBusinessNameUpdate: (name: string) => void;
  onAnalysisComplete?: (summary: string) => void;
}

export default function BusinessPanel({ business, policies, onUpload, onSendMessage, onLogout, onBusinessNameUpdate, onAnalysisComplete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<{ filename: string; typeNames: string[] } | null>(null);
  const [coverageAnalysis, setCoverageAnalysis] = useState<CoverageAnalysis>({});
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);

  useEffect(() => {
    getCoverageAnalysis().then(setCoverageAnalysis).catch(() => {});
  }, []);

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("Uploading…");
    try {
      await onUpload(file);
      setUploadStatus("Identifying…");
      const analysis = await identifyPolicy(file.name);
      setUploadStatus(null);
      if (analysis.types.length > 0) {
        setPendingAnalysis({
          filename: file.name,
          typeNames: analysis.types.map((t) => RISK_NAMES[t] ?? t),
        });
      }
    } catch {
      setUploadStatus("Upload failed");
      setTimeout(() => setUploadStatus(null), 4000);
    }
    e.target.value = "";
  }

  async function handleAnalyse() {
    setIsAnalysing(true);
    setAnalyseError(null);
    try {
      const result = await refreshCoverageAnalysis();
      if (Object.keys(result).length === 0) {
        setAnalyseError("No coverage data found — check policies are uploaded and try again.");
      } else {
        onAnalysisComplete?.(buildAnalysisSummary(result));
      }
      setCoverageAnalysis(result);
    } catch (err) {
      setAnalyseError(err instanceof Error ? err.message : "Analysis failed — please try again.");
    } finally {
      setIsAnalysing(false);
    }
  }

  const categories = [...new Set(RISKS.map((r) => r.category))];
  const policiesForRisk = (riskId: string) => policies.filter((p) => riskIdsForPolicy(p).includes(riskId));

  return (
    <div className="h-full w-full border-r border-slate-200 bg-slate-50 flex flex-col">
      <div className="flex-1 overflow-y-auto panel-scroll px-3 py-3 space-y-4">
        <BusinessCard business={business} onLogout={onLogout} onNameUpdate={onBusinessNameUpdate} />

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Policies</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!!uploadStatus}
              className="text-sm bg-white border border-primary/30 text-primary rounded-full px-4 py-1.5 hover:bg-primary-tint transition-colors font-medium disabled:opacity-60"
            >
              {uploadStatus ?? "Upload Policy"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleUploadChange} />
          </div>

          {pendingAnalysis && (
            <div className="bg-primary-tint border border-primary/20 rounded-lg px-3 py-2.5 text-sm mb-2">
              <p className="text-slate-800 font-medium mb-1.5">
                Identified: {pendingAnalysis.typeNames.join(" + ") || "Unknown type"}
              </p>
              <button
                onClick={() => setPendingAnalysis(null)}
                className="bg-primary text-white rounded-full px-3 py-1 hover:bg-primary/90 transition-colors font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {policies.length === 0 ? (
            <p className="text-sm text-slate-400 italic px-0.5">No policies uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {policies.map((p) => (
                <PolicyDocCard key={p.source_path} policy={p} onSendMessage={onSendMessage} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Risks Covered</h2>
            <button
              onClick={handleAnalyse}
              disabled={isAnalysing || policies.length === 0}
              className="text-sm bg-white border border-primary/30 text-primary rounded-full px-4 py-1.5 hover:bg-primary-tint transition-colors font-medium disabled:opacity-60"
            >
              {isAnalysing ? "Analysing…" : "Analyse Policies"}
            </button>
          </div>
          {analyseError && <p className="text-sm text-primary mb-2">{analyseError}</p>}
          <div className="space-y-3">
            {categories.map((category) => {
              const categoryRisks = RISKS.filter((r) => r.category === category);
              const gridItems: { risk: RiskDef; policy?: Policy; isDuplicate: boolean }[] = [];
              categoryRisks.forEach((risk) => {
                const covering = policiesForRisk(risk.id);
                if (covering.length === 0) {
                  gridItems.push({ risk, isDuplicate: false });
                } else {
                  covering.forEach((policy) => gridItems.push({ risk, policy, isDuplicate: covering.length > 1 }));
                }
              });

              return (
                <div key={category}>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {gridItems.map(({ risk, policy, isDuplicate }, i) => (
                      <RiskBox
                        key={`${risk.id}-${policy?.source_path ?? "none"}-${i}`}
                        risk={risk}
                        policy={policy}
                        isDuplicate={isDuplicate}
                        onSendMessage={onSendMessage}
                        business={business}
                        analysisData={coverageAnalysis[risk.id]}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
