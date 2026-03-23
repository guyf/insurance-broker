import { useRef, useState } from "react";

interface Props {
  onUpload: (file: File) => Promise<void>;
}

export function UploadButton({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-hover hover:bg-zinc-700 text-sidebar-text text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <span className="w-4 h-4 border-2 border-sidebar-muted border-t-sidebar-text rounded-full animate-spin flex-shrink-0" />
            <span className="text-sidebar-muted text-sm">Uploading…</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Document</span>
          </>
        )}
      </button>
    </>
  );
}
