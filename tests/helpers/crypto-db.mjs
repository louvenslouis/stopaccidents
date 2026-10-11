import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// PGlite has real pgcrypto but no Supabase Vault. This in-memory test double
// implements ONLY Vault's SQL interface. It must never be used in production.
export async function createCryptoDatabase() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text not null,name text unique,description text);
    create view vault.decrypted_secrets as select *,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text,new_name text default null,new_description text default '') returns uuid
    language plpgsql as $$ declare result uuid; begin
      insert into vault.secrets(secret,name,description) values(new_secret,new_name,new_description) returning id into result;
      return result;
    end $$;
  `);
  return db;
}
