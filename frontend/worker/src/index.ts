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
import { handleLogout } from "./routes/auth/logout";
import { handleGetBusiness } from "./routes/business";

export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    if (pathname === "/api/auth/otp-request" && method === "POST") return handleOtpRequest(request, env);
    if (pathname === "/api/auth/otp-verify" && method === "POST") return handleOtpVerify(request, env);
    if (pathname === "/api/auth/logout" && method === "POST") return handleLogout();
    if (pathname === "/api/business" && method === "GET") return handleGetBusiness(request, env);

    if (pathname === "/api/chat" && method === "POST") return handleChat(request, env);
    if (pathname === "/api/policies" && method === "GET") return handlePolicies();
    if (pathname === "/api/requote" && method === "POST") return handleRequote(request);
    if (pathname === "/api/upload" && method === "POST") return handleUpload(request);
    if (pathname === "/api/delete-policy" && method === "DELETE") return handleDeletePolicy(request);
    if (pathname === "/api/update-policy" && method === "PATCH") return handleUpdatePolicy(request);

    return env.ASSETS.fetch(request);
  },
};
