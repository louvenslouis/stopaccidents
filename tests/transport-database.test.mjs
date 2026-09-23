import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("Transport: directional routes, official fare evidence, demo fixtures and public read-only access", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260923024458_transport_stations.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const count = async (table) =>
      (await db.query(`select count(*)::int as total from public.${table}`))
        .rows[0].total;
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      assert.equal(await count("transport_stations"), 5);
      assert.equal(await count("transport_routes"), 8);
      assert.equal(await count("transport_vehicle_types"), 2);
      for (const sql of [
        "update public.transport_routes set official_fare_htg = 1",
        "delete from public.transport_stations",
        "insert into public.transport_vehicle_types values ('fake', 'Fake')",
        "insert into public.transport_stations(slug,name,commune,latitude,longitude) values ('fake','Fake','Fake',18.5,-72.3)",
      ])
        await assert.rejects(db.exec(sql), /permission denied/);
      await db.exec("reset role");
    }
    assert.equal(
      (
        await db.query(
          "select count(*)::int as total from public.transport_routes where is_demo",
        )
      ).rows[0].total,
      8,
    );
    const {
      rows: [route],
    } = await db.query("select * from public.transport_routes limit 1");
    const { rows: stations } = await db.query(
      "select id, slug from public.transport_stations",
    );
    await assert.rejects(
      db.query(
        "update public.transport_routes set arrival_station_id = departure_station_id where id = $1",
        [route.id],
      ),
      /transport_distinct_endpoints/,
    );
    await assert.rejects(
      db.query(
        "update public.transport_routes set official_fare_htg = -1 where id = $1",
        [route.id],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "update public.transport_routes set official_fare_htg = 'NaN' where id = $1",
        [route.id],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "update public.transport_routes set is_demo = false where id = $1",
        [route.id],
      ),
      /transport_official_fare_evidence/,
    );
    await assert.rejects(
      db.query(
        "update public.transport_routes set vehicle_type = 'unknown' where id = $1",
        [route.id],
      ),
      /foreign key/,
    );
    await assert.rejects(
      db.query(
        "insert into public.transport_routes(departure_station_id,arrival_station_id,vehicle_type) values ($1,$2,$3)",
        [
          route.departure_station_id,
          route.arrival_station_id,
          route.vehicle_type,
        ],
      ),
      /transport_route_direction_vehicle/,
    );
    await assert.rejects(
      db.exec("update public.transport_stations set latitude = 40"),
      /check constraint/,
    );
    await db.query(
      "update public.transport_routes set is_demo = false, fare_reference = 'Référence officielle de test', fare_effective_from = '2026-09-01' where id = $1",
      [route.id],
    );
    await db.query(
      "update public.transport_routes set official_fare_htg = null, fare_reference = null, fare_effective_from = null where id = $1",
      [route.id],
    );

    const origin = stations.find((s) => s.slug === "demo-champs-de-mars").id;
    const destination = stations.find((s) => s.slug === "demo-petion-ville").id;
    const forward = await db.query(
      "select vehicle_type from public.transport_routes where departure_station_id=$1 and arrival_station_id=$2 order by vehicle_type",
      [origin, destination],
    );
    assert.deepEqual(
      forward.rows.map((r) => r.vehicle_type),
      ["bus", "taptap"],
    );
    const reverse = await db.query(
      "select vehicle_type from public.transport_routes where departure_station_id=$1 and arrival_station_id=$2",
      [destination, origin],
    );
    assert.deepEqual(
      reverse.rows.map((r) => r.vehicle_type),
      ["taptap"],
      "No automatic reverse bus trip",
    );
    await db.query(
      "update public.transport_stations set is_active = false where id = $1",
      [destination],
    );
    await db.exec("set role anon");
    assert.equal(await count("transport_stations"), 4);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as total from public.transport_routes where departure_station_id=$1 or arrival_station_id=$1",
          [destination],
        )
      ).rows[0].total,
      0,
      "Inactive endpoints hide their trips",
    );
    await db.exec("reset role");
    await db.exec("update public.transport_routes set is_active = false");
    await db.exec("set role authenticated");
    assert.equal(await count("transport_routes"), 0);
  } finally {
    await db.close();
  }
});
