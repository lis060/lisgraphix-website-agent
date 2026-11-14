// Supabase Edge Function: place-details
//
// Returns business names (and, with detail=true, address and phone) fetched
// fresh from Google by place ID. Only signed-in, allowlisted dashboard users
// may call it. Results are returned to the browser and not stored.
//
// Needs the secret GOOGLE_PLACES_API_KEY set on the Supabase project.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fieldMaskFor, mapPlace, parseRequest, placeUrl, usageServiceFor, type PlaceView } from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "not_signed_in" });

  const url = Deno.env.get("SUPABASE_URL")!;
  // Acts as the caller, so the database's own access rules apply.
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });

  // Only allowlisted users can read app_users at all.
  const me = await asUser.from("app_users").select("id").limit(1);
  if (me.error || !me.data?.length) return json(403, { error: "not_authorised" });

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = parseRequest(body);
  if (!parsed.ok) return json(400, { error: "bad_request", message: parsed.error });

  // Look up place IDs through the caller's own access, so this cannot be used
  // to fetch details for arbitrary places.
  const rows = await asUser.from("businesses").select("id, external_id")
    .in("id", parsed.ids).eq("source", "google_places");
  if (rows.error) return json(500, { error: "lookup_failed" });
  const targets = (rows.data ?? []).filter((r) => typeof r.external_id === "string" && r.external_id);
  if (targets.length === 0) return json(200, { places: {} });

  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return json(503, { error: "not_configured" });

  const { service, cap } = usageServiceFor(parsed.detail);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const allowed = await admin.rpc("bump_api_usage", { p_service: service, p_calls: targets.length, p_cap: cap });
  if (allowed.error) return json(500, { error: "usage_check_failed" });
  if (allowed.data !== true) return json(429, { error: "daily_limit_reached" });

  const places: Record<string, PlaceView> = {};
  await Promise.all(targets.map(async (t) => {
    try {
      const res = await fetch(placeUrl(t.external_id), {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMaskFor(parsed.detail) },
      });
      if (res.ok) places[t.id] = mapPlace(await res.json(), parsed.detail);
    } catch { /* leave this one out; the dashboard keeps its fallback label */ }
  }));
  return json(200, { places });
});
