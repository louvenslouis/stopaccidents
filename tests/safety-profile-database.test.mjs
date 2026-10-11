import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { safetyDatabase } from "./helpers/safety-db.mjs";

test("confidential profile, exact event matching, consent, corrections and private push delivery", async () => {
  const db = await safetyDatabase();
  try {
    const owner = randomUUID(),
      close = randomUUID(),
      outsider = randomUUID(),
      reporter = randomUUID(),
      guest = randomUUID();
    await db.query(
      "insert into auth.users(id,is_anonymous) values ($1,false),($2,false),($3,false),($4,false),($5,true)",
      [owner, close, outsider, reporter, guest],
    );
    const session = randomUUID();
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      session,
      close,
    ]);
    await db.query(
      "insert into private.user_connections(sender_id,recipient_id,status,accepted_at) values($1,$2,'accepted',now()),($1,$3,'pending',null)",
      [owner, close, outsider],
    );
    async function login(id, role = "authenticated", sid = null) {
      await db.exec("reset role; set role " + role);
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: id, role, session_id: sid }),
      ]);
    }
    const rpc = async (name, args = [], params = "") =>
      (
        await db.query(
          `select public.${name}(${params || args.map((_, i) => "$" + (i + 1)).join(",")}) value`,
          args,
        )
      ).rows[0].value;
    const profile = () => rpc("read_safety_profile");
    const inbox = () => rpc("read_safety_alerts");
    const save = (id, kind, value, type = null, color = null, path = null) =>
      rpc("save_safety_record", [id, kind, value, type, color, path]);
    const vehicle = randomUUID(),
      identity = randomUUID();
    await login(owner);
    assert.deepEqual(await profile(), { alerts_enabled: false, records: [] });
    await save(vehicle, "registration", " ab-00123 ", "car", "Bleu");
    await save(identity, "identity", "00-987654");
    await rpc("set_safety_alerts_enabled", [true]);
    assert.equal((await profile()).records[0].value, "AB00123");
    await assert.rejects(
      save(randomUUID(), "registration", "AB00123", "car", "Bleu"),
      /safety_duplicate_record/,
    );
    await assert.rejects(
      save(randomUUID(), "identity", "XYZ123"),
      /safety_record_limit/,
    );
    for (const value of ["AB?00123", "AB/00123", "é1234", "12", "-----"])
      await assert.rejects(
        save(vehicle, "registration", value, "car", "Bleu"),
        /safety_invalid_record/,
      );
    await assert.rejects(
      save(vehicle, "registration", "ABC123", null, "Bleu"),
      /safety_invalid_record/,
    );
    await assert.rejects(
      save(vehicle, "registration", "ABC123", "car", null),
      /safety_invalid_record/,
    );
    await assert.rejects(
      save(
        identity,
        "identity",
        "00987654",
        null,
        null,
        `${outsider}/${randomUUID()}.jpg`,
      ),
      /safety_photo_unavailable/,
    );
    const photo = `${owner}/${randomUUID()}.jpg`;
    await db.query(
      "select public.save_identity_photo($1,'/9j/AA==')",
      [photo],
    );
    await save(identity, "identity", "00987654", null, null, photo);
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [photo],
        )
      ).rows.length,
      0,
    );
    await login(outsider);
    assert.deepEqual((await profile()).records, []);
    assert.equal(
      (
        await db.query(
          "select name from storage.objects where bucket_id='identity-cards'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      save(vehicle, "registration", "ABC123", "car", "Noir"),
      /safety_record_unavailable/,
    );
    await assert.rejects(
      rpc("delete_safety_record", [vehicle]),
      /safety_record_unavailable/,
    );
    for (const table of [
      "safety_records",
      "safety_alerts",
      "safety_preferences",
      "safety_push_devices",
      "safety_push_queue",
      "safety_push_worker_config",
    ]) {
      await assert.rejects(
        db.query(`select * from private.${table}`),
        (e) => e.code === "42501",
      );
    }
    for (const name of [
      "claim_safety_push_jobs",
      "authorize_safety_push_worker",
    ])
      await assert.rejects(
        rpc(name, name.includes("authorize") ? [randomUUID()] : []),
        (e) => e.code === "42501",
      );
    await login(guest);
    await assert.rejects(profile(), /connection_account_required/);
    await assert.rejects(
      rpc("set_safety_alerts_enabled", [true]),
      /connection_account_required/,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('identity-cards',$1)",
        [`${guest}/${randomUUID()}.jpg`],
      ),
      (e) => e.code === "42501",
    );
    await login(null, "anon");
    await assert.rejects(profile(), (e) => e.code === "42501");
    await login(close, "authenticated", session);
    const device = randomUUID();
    await rpc("register_safety_push_device", [
      device,
      "ExpoPushToken[abcdefghijklmnop]",
    ]);
    await login(reporter);
    const report = randomUUID();
    await rpc("save_accident_report_step", [
      report,
      1,
      "Delmas",
      18.55,
      -72.3,
      10,
    ]);
    assert.equal((await inbox()).length, 0);
    await rpc("save_accident_report_step", [
      report,
      2,
      null,
      null,
      null,
      null,
      "two_cars",
    ]);
    const detail = async (registrations, identities, id = report) => {
      await rpc("save_accident_report_step", [
        id,
        2,
        null,
        null,
        null,
        null,
        "two_cars",
      ]);
      await rpc("save_accident_report_step", [
        id,
        3,
        null,
        null,
        null,
        null,
        null,
        "unknown",
      ]);
      return rpc("save_accident_report_step", [
        id,
        4,
        null,
        null,
        null,
        null,
        null,
        null,
        "",
        registrations,
        identities,
        [],
      ]);
    };
    await detail(["AB0012"], ["0098765"]);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 0);
    await login(reporter);
    await detail(["ab - 00123"], ["00-987654"]);
    await login(close, "authenticated", session);
    let alerts = await inbox();
    assert.equal(alerts.length, 1);
    const serialized = JSON.stringify(alerts);
    for (const secret of ["AB00123", "00987654", photo, owner, reporter])
      assert.ok(!serialized.includes(secret));
    assert.equal(alerts[0].report_id, report);
    await rpc("mark_safety_alert_read", [alerts[0].id]);
    assert.ok((await inbox())[0].read_at);
    await login(outsider);
    assert.equal((await inbox()).length, 0);
    await assert.rejects(
      rpc("mark_safety_alert_read", [alerts[0].id]),
      /safety_alert_unavailable/,
    );
    await login(reporter);
    await detail(["AB-00123"], ["00987654"]);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    // Worker leases are exclusive; a stale acknowledgement cannot change a new lease.
    await login(null, "service_role");
    const jobs = await rpc("claim_safety_push_jobs");
    assert.equal(jobs.length, 1);
    assert.deepEqual(await rpc("claim_safety_push_jobs"), []);
    await rpc("finish_safety_push_job", [
      jobs[0].id,
      randomUUID(),
      "delivered",
      null,
      null,
    ]);
    await rpc("finish_safety_push_job", [
      jobs[0].id,
      jobs[0].lease,
      "receipt",
      "ticket-one",
      null,
    ]);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select state from private.safety_push_queue")).rows[0]
        .state,
      "receipt",
    );
    // A correction removes visibility and cancels outstanding delivery, even after a ticket.
    await login(reporter);
    await detail([], []);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 0);
    await login(null, "service_role");
    assert.deepEqual(await rpc("claim_safety_push_jobs"), []);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select state from private.safety_push_queue")).rows[0]
        .state,
      "cancelled",
    );
    await login(reporter);
    await detail(["AB00123"], []);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    // Deferred processing does not send a transient identifier written then withdrawn in the same transaction.
    const transient = randomUUID();
    await login(reporter);
    await db.exec("begin");
    await rpc("save_accident_report_step", [
      transient,
      1,
      "Delmas",
      18.55,
      -72.3,
      10,
    ]);
    await db.query(
      "insert into public.accident_report_identifiers(report_id,kind,value) values($1,'registration','AB00123')",
      [transient],
    );
    await db.query(
      "delete from public.accident_report_identifiers where report_id=$1",
      [transient],
    );
    await db.exec("commit");
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    // Another contribution to the same event is not a second alert.
    const sibling = randomUUID();
    await login(reporter);
    await rpc("save_accident_report_step", [
      sibling,
      1,
      "Delmas",
      18.55,
      -72.3,
      10,
    ]);
    await db.exec("reset role");
    await db.query(
      "update private.report_contributions set event_id=(select event_id from private.report_contributions where report_id=$1) where report_id=$2",
      [report, sibling],
    );
    await login(reporter);
    await detail(["AB00123"], [], sibling);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    // Suspended evidence no longer qualifies; another unsuspended contribution can still support the event.
    await db.exec("reset role");
    await db.query(
      "update private.report_contributions set published=false where report_id=$1",
      [report],
    );
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    await db.exec("reset role");
    await db.query(
      "update private.report_contributions set published=false where report_id=$1",
      [sibling],
    );
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 0);
    await db.exec("reset role");
    await db.query(
      "update private.report_contributions set published=true where report_id in ($1,$2)",
      [report, sibling],
    );
    await login(owner);
    await rpc("set_safety_alerts_enabled", [false]);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 0);
    await login(owner);
    await rpc("set_safety_alerts_enabled", [true]);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 0); // no retroactive re-subscription
    // An independent new event matches, but revoked sessions never receive pushes.
    await login(reporter);
    const next = randomUUID();
    await rpc("save_accident_report_step", [
      next,
      1,
      "Pétion-Ville",
      18.51,
      -72.28,
      10,
    ]);
    await detail(["AB00123"], [], next);
    await login(close, "authenticated", session);
    assert.equal((await inbox()).length, 1);
    await db.exec("reset role");
    await db.query("delete from auth.sessions where id=$1", [session]);
    await login(null, "service_role");
    assert.deepEqual(await rpc("claim_safety_push_jobs"), []);
    await login(owner);
    await rpc("delete_safety_record", [vehicle]);
    await login(close);
    assert.equal((await inbox()).length, 0);
    await login(owner);
    await rpc("delete_safety_record", [identity]);
    await rpc("delete_identity_photo", [photo]);
    await assert.rejects(rpc("read_identity_photo", [photo]), /safety_photo_unavailable/);
    assert.deepEqual((await profile()).records, []);
  } finally {
    await db.close();
  }
});

test("suspicious vehicle uses the explicit plate atomically, never narrative guessing or stale legacy data", async () => {
  const db = await safetyDatabase();
  try {
    const owner = randomUUID(),
      close = randomUUID(),
      reporter = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2),($3)", [
      owner,
      close,
      reporter,
    ]);
    await db.query(
      "insert into private.user_connections(sender_id,recipient_id,status,accepted_at) values($1,$2,'accepted',now())",
      [owner, close],
    );
    const login = async (id) => {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: id }),
      ]);
    };
    const rpc = async (name, args = []) =>
      (
        await db.query(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) value`,
          args,
        )
      ).rows[0].value;
    await login(owner);
    await rpc("save_safety_record", [
      randomUUID(),
      "registration",
      "ZZ-001",
      "car",
      "Noir",
      null,
    ]);
    await rpc("set_safety_alerts_enabled", [true]);
    await login(reporter);
    const report = randomUUID();
    await rpc("save_suspicious_vehicle_report_step", [
      report,
      1,
      "Delmas",
      18.55,
      -72.3,
      10,
    ]);
    await rpc("save_suspicious_vehicle_identity", [
      report,
      "Voiture noire",
      "Passages répétés",
      "ZZ - 001",
    ]);
    await login(close);
    let alerts = await rpc("read_safety_alerts");
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].report_kind, "suspicious_vehicle");
    await assert.rejects(
      rpc("save_suspicious_vehicle_identity", [
        report,
        "Faux véhicule",
        "Passages répétés",
        "ZZ001",
      ]),
      /Save the location first|unavailable/,
    );
    await login(reporter);
    await assert.rejects(
      rpc("save_suspicious_vehicle_identity", [
        report,
        "Description non valide",
        "Passages répétés",
        "ZZ?001",
      ]),
      /safety_invalid_record/,
    );
    const description = (
      await db.query(
        "select vehicle_description from public.suspicious_vehicle_reports where id=$1",
        [report],
      )
    ).rows[0].vehicle_description;
    assert.equal(description, "Voiture noire");
    await rpc("save_suspicious_vehicle_report_step", [
      report,
      2,
      null,
      null,
      null,
      null,
      "Ancienne application : ZZ001",
      "Passages répétés",
    ]);
    await login(close);
    assert.equal((await rpc("read_safety_alerts")).length, 0);
    await login(reporter);
    await rpc("save_suspicious_vehicle_identity", [
      report,
      "Voiture noire",
      "Passages répétés",
      "ZZ001",
    ]);
    await login(close);
    assert.equal((await rpc("read_safety_alerts")).length, 1);
    await login(reporter);
    await rpc("save_suspicious_vehicle_identity", [
      report,
      "Immatriculation : ZZ001",
      "Passages répétés",
      "",
    ]);
    await login(close);
    assert.equal((await rpc("read_safety_alerts")).length, 0);
  } finally {
    await db.close();
  }
});
