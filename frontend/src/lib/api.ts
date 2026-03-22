import type { ChatMessage, ChatResponse, Policy } from "./types";

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

export async function uploadPolicy(
  file: File
): Promise<{ status: string; chunks: number; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.text().catch(() => "Upload failed");
    throw new Error(err);
  }
  return res.json();
}
