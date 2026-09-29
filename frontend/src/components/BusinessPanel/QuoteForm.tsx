import { useState } from "react";
import type { BusinessInfo } from "../../lib/auth";

export type QuotableRisk = "el" | "pl" | "pi" | "cyber";

export const QUOTE_TOOLS: Record<QuotableRisk, string> = {
  el: "get_employers_liability_quote",
  pl: "get_public_liability_quote",
  pi: "get_professional_indemnity_quote",
  cyber: "get_cyber_quote",
};

const INDUSTRIES = ["office", "technology", "retail", "hospitality", "healthcare", "manufacturing", "engineering", "construction", "other"];
const PROFESSIONS = ["technology", "consulting", "marketing", "architecture", "engineering", "legal", "financial", "general"];

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = (value: string | null | undefined, allowed: string[], fallback: string) => {
  const v = (value ?? "").toLowerCase();
  return allowed.includes(v) ? v : fallback;
};

interface Props {
  risk: QuotableRisk;
  riskName: string;
  business: BusinessInfo;
  onSubmit: (toolName: string, args: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

/** Small form that prefills from the business's accounts and calls the quote tool directly. */
export function QuoteForm({ risk, riskName, business, onSubmit, onClose }: Props) {
  const f = business.financials;
  const connected = f != null;
  const [revenue, setRevenue] = useState(f?.revenue != null ? String(Math.round(f.revenue)) : "");
  const [employees, setEmployees] = useState(f?.employees != null ? String(f.employees) : "");
  const [payroll, setPayroll] = useState(f?.payroll != null ? String(Math.round(f.payroll)) : "");
  const [industry, setIndustry] = useState(pick(f?.industry, INDUSTRIES, "office"));
  const [profession, setProfession] = useState(pick(f?.industry, PROFESSIONS, "general"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsRevenue = risk !== "el";
  const needsEmployees = risk !== "pi";
  const needsPayroll = risk === "el";
  const needsIndustry = risk !== "pi";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = (v: string) => Number(v.replace(/[£,\s]/g, ""));
    const args: Record<string, unknown> = {};
    if (needsRevenue) args.revenue = num(revenue);
    if (needsEmployees) args.employees = Math.round(num(employees));
    if (needsPayroll) args.annual_payroll = num(payroll);
    if (needsIndustry) args.industry = industry;
    if (risk === "pi") args.profession = profession;
    if (Object.values(args).some((v) => typeof v === "number" && (!Number.isFinite(v) || v < 0))) {
      setError("Please fill in the figures as numbers.");
      return;
    }
    if (needsRevenue && !(args.revenue as number) ) return setError("Enter annual revenue.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(QUOTE_TOOLS[risk], args);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a quote — please try again.");
      setBusy(false);
    }
  }

  const input = "w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400";
  const label = "block text-xs font-medium text-slate-500 mb-0.5";

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3">
        <h3 className="font-semibold text-slate-900">{riskName} quote</h3>
        <p className="text-xs text-slate-500">
          {connected
            ? "Pre-filled from your accounts — change anything that's out of date."
            : "Enter a few details for an illustrative price. Connect Xero or QuickBooks to fill these in automatically."}
        </p>
        {needsRevenue && (
          <div>
            <label className={label}>Annual revenue (£)</label>
            <input className={input} inputMode="numeric" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
        )}
        {needsEmployees && (
          <div>
            <label className={label}>Employees</label>
            <input className={input} inputMode="numeric" value={employees} onChange={(e) => setEmployees(e.target.value)} />
          </div>
        )}
        {needsPayroll && (
          <div>
            <label className={label}>Annual payroll (£)</label>
            <input className={input} inputMode="numeric" value={payroll} onChange={(e) => setPayroll(e.target.value)} />
          </div>
        )}
        {needsIndustry && (
          <div>
            <label className={label}>Industry</label>
            <select className={input} value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{title(i)}</option>)}
            </select>
          </div>
        )}
        {risk === "pi" && (
          <div>
            <label className={label}>Profession</label>
            <select className={input} value={profession} onChange={(e) => setProfession(e.target.value)}>
              {PROFESSIONS.map((i) => <option key={i} value={i}>{title(i)}</option>)}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-primary">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 text-sm border border-slate-200 rounded-full py-2 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex-1 text-sm bg-primary text-white rounded-full py-2 font-medium hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Getting quote…" : "Get quote"}
          </button>
        </div>
      </form>
    </div>
  );
}
