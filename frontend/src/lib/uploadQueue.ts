import { useCallback, useRef, useState } from "react";
import { unzipSync } from "fflate";
import { uploadPolicy } from "./api";

export type UploadStatus = "queued" | "uploading" | "done" | "failed";

export interface UploadItem {
  id: number;
  name: string;
  status: UploadStatus;
  error?: string;
}

const CONCURRENCY = 3;
const isPdf = (name: string) => /\.pdf$/i.test(name);
const isZip = (name: string) => /\.zip$/i.test(name);

/** Expands zips into their PDFs (ignoring macOS junk); anything else that isn't a PDF is skipped. */
export async function expandFiles(files: File[]): Promise<{ pdfs: File[]; skipped: string[] }> {
  const pdfs: File[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isPdf(file.name)) {
      pdfs.push(file);
    } else if (isZip(file.name)) {
      try {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
        for (const [path, data] of Object.entries(entries)) {
          if (path.startsWith("__MACOSX/") || path.endsWith("/")) continue;
          const name = path.split("/").pop() ?? path;
          if (name.startsWith(".")) continue;
          if (isPdf(name)) pdfs.push(new File([data], name, { type: "application/pdf" }));
          else skipped.push(name);
        }
      } catch {
        skipped.push(file.name);
      }
    } else {
      skipped.push(file.name);
    }
  }
  return { pdfs, skipped };
}

/**
 * Shared upload queue: accepts PDFs and zips of PDFs, uploads up to CONCURRENCY at a time and
 * exposes per-file status. `onBatchDone` fires once when everything queued so far has settled.
 */
export function useUploadQueue(onBatchDone: (summary: { done: number; failed: number; skipped: string[] }) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(1);
  const pending = useRef(0);
  const tally = useRef({ done: 0, failed: 0, skipped: [] as string[] });
  const cb = useRef(onBatchDone);
  cb.current = onBatchDone;

  const patch = (id: number, p: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const enqueue = useCallback(async (files: File[]) => {
    const { pdfs, skipped } = await expandFiles(files);
    tally.current.skipped.push(...skipped);
    if (pdfs.length === 0) {
      if (pending.current === 0) {
        cb.current({ ...tally.current });
        tally.current = { done: 0, failed: 0, skipped: [] };
      }
      return;
    }
    const jobs = pdfs.map((file) => ({ file, id: nextId.current++ }));
    setItems((prev) => [...prev, ...jobs.map((j) => ({ id: j.id, name: j.file.name, status: "queued" as const }))]);
    pending.current += jobs.length;

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const { file, id } = jobs[cursor++];
        patch(id, { status: "uploading" });
        try {
          await uploadPolicy(file);
          patch(id, { status: "done" });
          tally.current.done++;
        } catch (e) {
          patch(id, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" });
          tally.current.failed++;
        }
        if (--pending.current === 0) {
          cb.current({ ...tally.current });
          tally.current = { done: 0, failed: 0, skipped: [] };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  }, []);

  const clearFinished = useCallback(
    () => setItems((prev) => prev.filter((i) => i.status === "queued" || i.status === "uploading")),
    [],
  );

  return { items, enqueue, clearFinished, busy: items.some((i) => i.status === "queued" || i.status === "uploading") };
}
