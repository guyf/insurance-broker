import { useEffect, useState } from "react";
import { requestOtp, verifyOtp } from "../../lib/auth";

interface Props {
  onAuthenticated: () => void;
}

type Stage = "email" | "code";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  xero_state_mismatch: "Xero sign-in expired or was tampered with — please try again.",
  xero_no_code: "Xero didn't return an authorization code — please try again.",
  xero_no_email: "Couldn't read an email address from your Xero account.",
  xero_callback_failed: "Xero sign-in failed — please try again.",
  missing_token: "That link is missing its verification token.",
  invalid_or_expired: "That link is invalid or has expired — request a new one.",
};

export default function LoginGate({ onAuthenticated }: Props) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setError(AUTH_ERROR_MESSAGES[authError] ?? "Sign-in failed — please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email);
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email, code);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">
          {stage === "email"
            ? "Enter your email to get a sign-in code."
            : `Enter the code we sent to ${email}.`}
        </p>

        {stage === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="email"
              required
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-gray-900 text-white text-sm font-medium py-2 hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              required
              autoFocus
              placeholder="Code from email"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-gray-900 text-white text-sm font-medium py-2 hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); setError(null); }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-6 pt-6 border-t border-gray-100 space-y-2">
          <a
            href="/api/auth/xero-start"
            className="block w-full text-center rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2 hover:bg-gray-50 transition-colors"
          >
            Continue with Xero
          </a>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="w-full rounded-lg border border-gray-200 text-gray-400 text-sm font-medium py-2 cursor-not-allowed"
          >
            Continue with QuickBooks
          </button>
        </div>
      </div>
    </div>
  );
}
