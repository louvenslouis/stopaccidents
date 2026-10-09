-- Include independent rural headwear and its fabric or ribbon color in shared portraits.
create or replace function private.profile_avatar(account uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select (select jsonb_object_agg(key, value) from jsonb_each(
    case when jsonb_typeof(u.raw_user_meta_data->'avatar') = 'object'
      then u.raw_user_meta_data->'avatar' else '{}'::jsonb end)
    where key in (
      'version', 'skin', 'face', 'eyeColor', 'hair', 'hairColor', 'expression',
      'beard', 'glasses', 'glassesColor', 'earrings', 'clothing', 'clothingColor',
      'background', 'backgroundPattern', 'headwear', 'headwearColor'
    )
      and jsonb_typeof(value) in ('string','number') and length(value::text) < 64)
  from auth.users u where u.id = account and not u.is_anonymous;
$$;
revoke all on function private.profile_avatar(uuid) from public, anon, authenticated;
