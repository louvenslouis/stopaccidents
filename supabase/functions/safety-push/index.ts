// @ts-nocheck -- Supabase Edge / Deno entry point; dispatch.mjs is tested with Node.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { dispatchSafetyPush } from "./dispatch.mjs";

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
    const result = await dispatchSafetyPush({
      rpc: (name, args) => client.rpc(name, args),
      fetch,
      accessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
    });
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "delivery_temporarily_unavailable" },
      { status: 503 },
    );
  }
});
