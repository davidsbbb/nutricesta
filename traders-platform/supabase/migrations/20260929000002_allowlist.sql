-- =============================================================================
-- Allowlist también en la base de datos.
-- En un proyecto Supabase en la nube, aunque alguien olvidara desactivar el
-- registro público, ningún email fuera de esta tabla puede crear usuario.
-- La tabla la rellena el servidor (service role) SOLO con emails que estén en
-- ALLOWED_EMAILS, justo antes de crear el usuario.
-- =============================================================================

create table private.allowed_emails (
  email      text primary key check (email = lower(email)),
  added_at   timestamptz not null default now()
);

create or replace function private.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from private.allowed_emails where email = lower(new.email)) then
    raise exception 'Entorno privado: email no invitado'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger enforce_allowlist
  before insert or update of email on auth.users
  for each row execute function private.enforce_allowlist();

-- Solo el servidor (service_role) puede añadir emails. Nunca authenticated/anon.
create or replace function public.server_allow_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from private.allowed_emails where email <> lower(p_email)) >= 3 then
    raise exception 'Entorno privado: máximo 3 emails invitados';
  end if;
  insert into private.allowed_emails (email) values (lower(p_email))
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.server_allow_email(text) from public, anon, authenticated;
grant execute on function public.server_allow_email(text) to service_role;
