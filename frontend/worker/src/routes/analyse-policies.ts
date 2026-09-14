/**
 * POST /api/analyse-policies
 * Ports xero-insurance's analyse_tenant_policies: runs a batch of targeted
 * searches across the business's uploaded policy documents, then a single
 * Claude call extracts structured per-risk coverage data (summary,
 * exclusions, concerns) for the coverage checklist. Persists the result to
 * coverage_analysis so GET /api/coverage-analysis doesn't need to re-run
 * this on every page load — call this again explicitly to refresh.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const BROKER_HTTP_BASE = "https://insurance-broker-production-85e3.up.railway.app";

const RISK_NAMES: Record<string, string> = {
  el: "Employers' Liability",
  pl: "Public Liability",
  pi: "Professional Indemnity",
  cyber: "Cyber Liability",
  property: "Commercial Property",
  bi: "Business Interruption",
  product: "Product Liability",
  transit: "Goods in Transit",
  do: "Directors & Officers",
  keyperson: "Key Person Insurance",
};

// Diverse searches to surface different sections of the combined policy text —
// a single generic query wouldn't reliably hit every risk's specific clauses.
const SEARCH_QUERIES = [
  "employers liability limit of indemnity employees compensation",
  "public liability products liability limit third party injury",
  "professional indemnity negligence errors omissions cover",
  "property damage buildings contents sum insured all risks",
  "business interruption loss of income period of indemnity",
  "cyber data breach security incident liability",
  "what is not covered exclusions exceptions general conditions",
  "cover limits schedule sums insured indemnity amounts",
];

interface PolicyRow {
  filename?: string;
  provider?: string;
  premium?: string;
  renewal_date?: string;
}

export type CoverageAnalysis = Record<
  string,
  { summary: string; exclusions: string[]; concerns: string[] }
>;

function extractJson<T>(text: string, fallback: T): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) return fallback;
  try {
    return JSON.parse(text.slice(start, end)) as T;
  } catch {
    return fallback;
  }
}

export async function handleAnalysePolicies(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const listResp = await fetch(
      `${BROKER_HTTP_BASE}/list-policies?business_id=${encodeURIComponent(auth.businessId)}`
    );
    const policies: PolicyRow[] = listResp.ok ? await listResp.json() : [];

    if (policies.length === 0) {
      return withRefreshedCookie(
        new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }),
        auth.refreshedCookie
      );
    }

    const policyMeta = policies
      .map((p) => {
        const parts = [p.filename ?? "unnamed"];
        if (p.provider) parts.push(`Insurer: ${p.provider}`);
        if (p.premium) parts.push(`Premium: ${p.premium}`);
        if (p.renewal_date) parts.push(`Renewal: ${p.renewal_date}`);
        return `- ${parts.join(" | ")}`;
      })
      .join("\n");

    const seen = new Set<string>();
    const chunks: string[] = [];
    await Promise.all(
      SEARCH_QUERIES.map(async (query) => {
        const resp = await fetch(`${BROKER_HTTP_BASE}/search-docs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, business_id: auth.businessId, limit: 6 }),
        });
        if (!resp.ok) return;
        const rows = (await resp.json()) as Array<{ content?: string }>;
        for (const row of rows) {
          const content = (row.content ?? "").trim();
          if (content && !seen.has(content)) {
            seen.add(content);
            chunks.push(content);
          }
        }
      })
    );

    if (chunks.length === 0) {
      return withRefreshedCookie(
        new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }),
        auth.refreshedCookie
      );
    }

    const documentText = chunks.join("\n\n---\n\n");
    const riskList = Object.entries(RISK_NAMES)
      .map(([id, name]) => `  "${id}": ${name}`)
      .join("\n");

    const prompt = `You are analysing insurance policy documents for a UK business.

## Policy files on record
${policyMeta}

## Extracted document text
${documentText}

---

## Task
The risk IDs below may or may not be covered. For each one that is explicitly present in the documents, return a JSON entry.

Risk IDs:
${riskList}

Rules:
- Only include a risk ID if the documents explicitly confirm it is covered (by section heading, clause, or clear statement).
- "summary": name the insurer and describe exactly what this section covers — including the specific cover limit or sum insured if stated. Be precise, not generic.
- "exclusions": list specific exclusions or conditions you can read in the text for this risk. Up to 3 short phrases (3-8 words). Do not invent generic exclusions.
- "concerns": flag anything actionable — missing schedule with actual sums insured, sub-limits, imminent renewal. Up to 2 short phrases.

Return ONLY valid JSON, no other text:
{
  "el": {"summary": "...", "exclusions": ["..."], "concerns": ["..."]},
  "pl": {"summary": "...", "exclusions": [...], "concerns": [...]},
  ...
}`;

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    let analysis: CoverageAnalysis = {};
    for (const block of response.content) {
      if (block.type === "text") analysis = extractJson(block.text, analysis);
    }

    // Persist so subsequent page loads don't need to re-run this — best-effort,
    // the freshly computed result is returned below regardless of whether the
    // store succeeds.
    fetch(`${BROKER_HTTP_BASE}/coverage-analysis?business_id=${encodeURIComponent(auth.businessId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis }),
    }).catch(() => {/* best-effort */});

    return withRefreshedCookie(
      new Response(JSON.stringify(analysis), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    console.error("Analyse policies error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Analysis failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
