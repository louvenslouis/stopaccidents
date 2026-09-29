import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchSafetyPush } from "../supabase/functions/safety-push/dispatch.mjs";

const job = {
  id: "job",
  lease: "lease",
  token: "ExpoPushToken[token]",
  ticket_id: null,
};
async function run(response, current = job) {
  const calls = [],
    http = [];
  const result = await dispatchSafetyPush({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === "claim_safety_push_jobs"
        ? { data: [current] }
        : name === "safety_push_job_eligible"
          ? { data: true }
          : { error: null };
    },
    fetch: async (url, options) => {
      http.push({ url, ...options });
      if (response instanceof Error) throw response;
      return { ok: true, json: async () => response };
    },
  });
  return { result, calls, http, ack: calls[2].args };
}
test("push only discloses generic content and persists its provider ticket", async () => {
  const { ack, http } = await run({ data: { status: "ok", id: "ticket" } });
  assert.equal(ack.p_status, "receipt");
  assert.equal(ack.p_ticket, "ticket");
  const payload = JSON.parse(http[0].body);
  assert.deepEqual(payload.data, { type: "safety_alert" });
  assert.equal(payload.to, job.token);
  assert.equal(payload.channelId, "safety-alerts");
  assert.ok(!http[0].body.includes("alias"));
  assert.ok(!http[0].body.includes("report_id"));
});
test("network failures retry, unregistered devices are revoked, receipts are verified", async () => {
  assert.equal((await run(new Error("timeout"))).ack.p_status, "retry");
  assert.equal(
    (
      await run({
        data: { status: "error", details: { error: "DeviceNotRegistered" } },
      })
    ).ack.p_status,
    "unregistered",
  );
  assert.equal(
    (
      await run(
        { data: { ticket: { status: "ok" } } },
        { ...job, ticket_id: "ticket" },
      )
    ).ack.p_status,
    "delivered",
  );
  assert.equal(
    (await run({ data: {} }, { ...job, ticket_id: "ticket" })).ack.p_status,
    "retry",
  );
  assert.equal((await run({ data: { status: "ok" } })).ack.p_status, "retry");
});
test("claim/ack errors are surfaced instead of falsely confirming delivery", async () => {
  await assert.rejects(
    dispatchSafetyPush({
      rpc: async () => ({ error: true }),
      fetch: async () => {
        throw Error("must not send");
      },
    }),
    /claim_failed/,
  );
  await assert.rejects(
    dispatchSafetyPush({
      rpc: async (name) =>
        name === "claim_safety_push_jobs"
          ? { data: [job] }
          : name === "safety_push_job_eligible"
            ? { data: true }
            : { error: true },
      fetch: async () => ({ ok: false, status: 503 }),
    }),
    /acknowledgement_failed/,
  );
});

test("revocation between claiming and sending suppresses the push", async () => {
  const result = await dispatchSafetyPush({
    rpc: async (name) =>
      name === "claim_safety_push_jobs" ? { data: [job] } : { data: false },
    fetch: async () => {
      throw Error("must not send");
    },
  });
  assert.equal(result.processed, 0);
});
