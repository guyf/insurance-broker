import type { ChatMessage, ChatResponse, CoverageAnalysis, IdentifyResult, Policy, QuoteResult } from "./types";

export async function sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Chat failed: ${err}`);
  }
  return res.json() as Promise<ChatResponse>;
}

export async function fetchPolicies(): Promise<Policy[]> {
  const res = await fetch("/api/policies");
  if (!res.ok) throw new Error("Failed to fetch policies");
  return res.json() as Promise<Policy[]>;
}

export async function updatePolicyMetadata(
  sourcePaths: string[],
  updates: Record<string, string>
): Promise<void> {
  const res = await fetch("/api/update-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_paths: sourcePaths, updates }),
  });
  if (!res.ok) throw new Error("Failed to update policy metadata");
}

export async function deletePolicy(sourcePaths: string[]): Promise<void> {
  const res = await fetch("/api/delete-policy", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_paths: sourcePaths }),
  });
  if (!res.ok) throw new Error("Failed to delete policy");
}

export async function requote(toolName: string, args: Record<string, unknown>): Promise<QuoteResult> {
  const res = await fetch("/api/requote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, args }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Requote failed: ${err}`);
  }
  return (await res.json() as { quote: QuoteResult }).quote;
}

export async function uploadPolicy(
  file: File,
  sourceFolder?: string
): Promise<{ status: string; chunks: number; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  if (sourceFolder) fd.append("source_folder", sourceFolder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.text().catch(() => "Upload failed");
    throw new Error(err);
  }
  return res.json();
}

export async function identifyPolicy(filename: string): Promise<IdentifyResult> {
  const res = await fetch("/api/identify-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) throw new Error("Failed to identify policy");
  return res.json();
}

export async function getCoverageAnalysis(): Promise<CoverageAnalysis> {
  const res = await fetch("/api/coverage-analysis");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch coverage analysis");
  }
  return res.json();
}

export async function refreshCoverageAnalysis(): Promise<CoverageAnalysis> {
  const res = await fetch("/api/analyse-policies", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to analyse policies");
  }
  return res.json();
}
