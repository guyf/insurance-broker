import { clearedSessionCookieHeader } from "../../auth/session";

export async function handleLogout(): Promise<Response> {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearedSessionCookieHeader(),
    },
  });
}
