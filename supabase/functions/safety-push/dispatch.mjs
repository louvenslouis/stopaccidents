/** All content is generic: no plate, identity number, alias, location or report ID goes to Expo. */
export async function dispatchSafetyPush({ rpc, fetch: fetcher, accessToken }) {
  return dispatchPush({ rpc, fetch: fetcher, accessToken, kind: "safety" });
}

export async function dispatchRoutePush({ rpc, fetch: fetcher, accessToken }) {
  return dispatchPush({ rpc, fetch: fetcher, accessToken, kind: "route" });
}

async function dispatchPush({ rpc, fetch: fetcher, accessToken, kind }) {
  const { data: jobs, error } = await rpc(`claim_${kind}_push_jobs`, {});
  if (error || !Array.isArray(jobs)) throw new Error("claim_failed");
  let processed = 0;
  const headers = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  // At most five provider requests run at once. Leases protect concurrent workers.
  async function deliver(job) {
    const { data: eligible, error: eligibilityError } = await rpc(
      `${kind}_push_job_eligible`,
      { p_id: job.id, p_lease: job.lease },
    );
    if (eligibilityError) throw new Error("eligibility_failed");
    if (!eligible) return;
    let status = "retry",
      ticket = null,
      reason = null;
    try {
      const receipt = !!job.ticket_id;
      const response = await fetcher(
        `https://exp.host/--/api/v2/push/${receipt ? "getReceipts" : "send"}`,
        {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify(
            receipt
              ? { ids: [job.ticket_id] }
              : {
                  to: job.token,
                  title: "Stop Accidents",
                  body: kind === "route"
                    ? "Un problème a été signalé sur votre trajet. Ouvrez l’application."
                    : "Une alerte concernant un proche est disponible. Ouvrez l’application.",
                  data: { type: `${kind}_alert` },
                  sound: "default",
                  channelId: `${kind}-alerts`,
                  priority: "high",
                  ttl: kind === "route" ? Math.max(1, Math.min(3600, Number(job.ttl) || 3600)) : 3600,
                },
          ),
        },
      );
      if (!response.ok) reason = `http_${response.status}`;
      else {
        const body = await response.json();
        const result = receipt
          ? body.data?.[job.ticket_id]
          : Array.isArray(body.data)
            ? body.data[0]
            : body.data;
        if (result?.status === "ok") {
          if (receipt) status = "delivered";
          else if (typeof result.id === "string") {
            status = "receipt";
            ticket = result.id;
          } else reason = "invalid_ticket";
        } else if (result?.details?.error === "DeviceNotRegistered") {
          status = "unregistered";
          reason = "DeviceNotRegistered";
        } else if (result?.details?.error === "MessageTooBig") {
          status = "failed";
          reason = "MessageTooBig";
        } else
          reason = receipt && !result ? "receipt_pending" : "provider_error";
      }
    } catch {
      reason = "network_error";
    }
    const { error: finishError } = await rpc(`finish_${kind}_push_job`, {
      p_id: job.id,
      p_lease: job.lease,
      p_status: status,
      p_ticket: ticket,
      p_error: reason,
    });
    if (finishError) throw new Error("acknowledgement_failed");
    processed++;
  }
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(jobs.slice(offset, offset + 5).map(deliver));
  }
  return { processed };
}
