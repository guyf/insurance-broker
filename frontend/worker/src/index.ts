/**
 * Serves the built SPA (dist/, via the ASSETS binding) and routes /api/*
 * to the same handlers that used to be separate Cloudflare Pages Functions
 * (see worker/src/routes/) — merged into one Worker so deploys go through
 * Cloudflare's git-connected Workers Builds instead of a GitHub Actions
 * `wrangler pages deploy` step.
 */
import { handleChat } from "./routes/chat";
import { handlePolicies } from "./routes/policies";
import { handleRequote } from "./routes/requote";
import { handleUpload } from "./routes/upload";
import { handleDeletePolicy } from "./routes/delete-policy";
import { handleUpdatePolicy } from "./routes/update-policy";
import { handleOtpRequest } from "./routes/auth/otp-request";
import { handleOtpVerify } from "./routes/auth/otp-verify";
import { handleLinkVerify } from "./routes/auth/link-verify";
import { handleLogout } from "./routes/auth/logout";
import { handleXeroStart } from "./routes/auth/xero-start";
import { handleXeroCallback } from "./routes/auth/xero-callback";
import { handleQuickbooksStart } from "./routes/auth/quickbooks-start";
import { handleQuickbooksCallback } from "./routes/auth/quickbooks-callback";
import { handleGetBusiness, handleUpdateBusiness } from "./routes/business";
import { handleGetCoverageAnalysis } from "./routes/coverage-analysis";
import { handleAnalysePolicies } from "./routes/analyse-policies";
import { handleIdentifyPolicy } from "./routes/identify-policy";

export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  XERO_CLIENT_ID: string;
  XERO_CLIENT_SECRET: string;
  INTUIT_CLIENT_ID: string;
  INTUIT_CLIENT_SECRET: string;
  QUICKBOOKS_API_BASE: string;
  QUICKBOOKS_ACCOUNTS_BASE: string;
  ASSETS: Fetcher;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname === "/api/auth/otp-request" && method === "POST") return handleOtpRequest(request, env);
  if (pathname === "/api/auth/otp-verify" && method === "POST") return handleOtpVerify(request, env);
  if (pathname === "/api/auth/link-verify" && method === "GET") return handleLinkVerify(request, env);
  if (pathname === "/api/auth/xero-start" && method === "GET") return handleXeroStart(request, env);
  if (pathname === "/api/auth/xero-callback" && method === "GET") return handleXeroCallback(request, env);
  if (pathname === "/api/auth/quickbooks-start" && method === "GET") return handleQuickbooksStart(request, env);
  if (pathname === "/api/auth/quickbooks-callback" && method === "GET") return handleQuickbooksCallback(request, env);
  if (pathname === "/api/auth/logout" && method === "POST") return handleLogout();
  if (pathname === "/api/business" && method === "GET") return handleGetBusiness(request, env);
  if (pathname === "/api/business" && method === "PATCH") return handleUpdateBusiness(request, env);

  if (pathname === "/api/chat" && method === "POST") return handleChat(request, env);
  if (pathname === "/api/policies" && method === "GET") return handlePolicies(request, env);
  if (pathname === "/api/requote" && method === "POST") return handleRequote(request, env);
  if (pathname === "/api/upload" && method === "POST") return handleUpload(request, env);
  if (pathname === "/api/delete-policy" && method === "DELETE") return handleDeletePolicy(request, env);
  if (pathname === "/api/update-policy" && method === "PATCH") return handleUpdatePolicy(request, env);
  if (pathname === "/api/coverage-analysis" && method === "GET") return handleGetCoverageAnalysis(request, env);
  if (pathname === "/api/analyse-policies" && method === "POST") return handleAnalysePolicies(request, env);
  if (pathname === "/api/identify-policy" && method === "POST") return handleIdentifyPolicy(request, env);

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env);
    // This whole app sits behind a login and has nothing worth indexing —
    // belt-and-suspenders alongside robots.txt and the HTML meta tag, since
    // this header also covers /api/* JSON responses a crawler might hit.
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return new Response(response.body, { status: response.status, headers });
  },
};
