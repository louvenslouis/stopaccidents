// @ts-nocheck -- Supabase Edge / Deno entry point; dispatch.mjs is tested with Node.
// eslint-disable-next-line import/no-unresolved -- Resolved by the Deno npm loader.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { dispatchSafetyPush, dispatchRoutePush } from "./dispatch.mjs";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = request.headers.get("x-safety-worker-key");
  if (!secret || !/^[0-9a-f-]{36}$/.test(secret))
    return new Response(null, { status: 401 });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.rpc("authorize_safety_push_worker", {
    p_secret: secret,
  });
  if (error || data !== true) return new Response(null, { status: 401 });
  try {
    const dependencies = {
      rpc: (name, args) => client.rpc(name, args),
      fetch,
      accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
    };
    // The existing one-minute cron drives both independent queues.
    const results = await Promise.allSettled([
      dispatchSafetyPush(dependencies),
      dispatchRoutePush(dependencies),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("delivery_temporarily_unavailable");
    }
    return Response.json({
      processed: results.reduce((count, result) => count + result.value.processed, 0),
    });
  } catch {
    return Response.json(
      { error: "delivery_temporarily_unavailable" },
      { status: 503 },
    );
  }
});
