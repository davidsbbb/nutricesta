-- =============================================================================
-- FASE 1 · Núcleo: roles, perfiles, ajustes, documentos legales, aceptaciones
-- y log de auditoría inmutable. Entorno PRIVADO de pruebas (máx. 3 usuarios).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Esquema no expuesto por la API de Supabase (solo funciones internas).
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Tope duro de 3 usuarios a nivel de base de datos (defensa en profundidad:
-- el registro público está desactivado en supabase/config.toml y el servidor
-- solo crea usuarios de ALLOWED_EMAILS).
-- -----------------------------------------------------------------------------
create or replace function private.enforce_user_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('private.enforce_user_cap'));
  if (select count(*) from auth.users) >= 3 then
    raise exception 'Entorno privado: máximo 3 usuarios'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_user_cap
  before insert on auth.users
  for each row execute function private.enforce_user_cap();

-- -----------------------------------------------------------------------------
-- Log de auditoría inmutable (append-only + cadena de hashes)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id    uuid,                       -- sin FK: sobrevive al borrado RGPD (seudónimo)
  action      text not null,
  entity_type text not null,
  entity_id   text,
  payload     jsonb not null default '{}'::jsonb,
  prev_hash   text not null,
  hash        text not null unique
);

comment on table public.audit_log is
  'Append-only. UPDATE/DELETE/TRUNCATE bloqueados por trigger. Cada fila encadena el hash de la anterior.';

create or replace function private.audit_hash(
  p_prev text, p_occurred_at timestamptz, p_actor uuid, p_action text,
  p_entity_type text, p_entity_id text, p_payload jsonb
) returns text
language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(
    concat_ws('|', p_prev, p_occurred_at::text, coalesce(p_actor::text, ''),
              p_action, p_entity_type, coalesce(p_entity_id, ''), p_payload::text),
    'sha256'), 'hex');
$$;

-- Única vía de escritura en el log.
create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
  v_at   timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
begin
  -- Serializa las escrituras para que la cadena sea lineal.
  perform pg_advisory_xact_lock(hashtext('public.audit_log'));
  select hash into v_prev from public.audit_log order by id desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  insert into public.audit_log (occurred_at, actor_id, action, entity_type, entity_id, payload, prev_hash, hash)
  values (v_at, v_actor, p_action, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), v_prev,
          private.audit_hash(v_prev, v_at, v_actor, p_action, p_entity_type, p_entity_id,
                             coalesce(p_payload, '{}'::jsonb)));
end;
$$;

create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es inmutable (% bloqueado)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

-- Trigger genérico para auditar cambios de filas. Los argumentos del trigger
-- son columnas a EXCLUIR del payload (datos personales / fiscales).
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_col text;
  v_id  text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  if tg_nargs > 0 then
    foreach v_col in array tg_argv loop
      v_row := v_row - v_col;
      if v_old is not null then v_old := v_old - v_col; end if;
    end loop;
  end if;
  v_id := coalesce(v_row->>'id', v_row->>'user_id');
  perform private.audit(
    lower(tg_op), tg_table_name, v_id,
    jsonb_strip_nulls(jsonb_build_object('new', case when tg_op <> 'DELETE' then v_row end,
                                         'old', v_old)));
  return null;
end;
$$;

-- Verificación de integridad: devuelve el primer id roto o NULL si todo cuadra.
create or replace function public.verify_audit_chain()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_prev text := 'GENESIS';
begin
  if not public.is_admin() then
    raise exception 'Solo admin' using errcode = 'insufficient_privilege';
  end if;
  for r in select * from public.audit_log order by id loop
    if r.prev_hash <> v_prev
       or r.hash <> private.audit_hash(r.prev_hash, r.occurred_at, r.actor_id, r.action,
                                       r.entity_type, r.entity_id, r.payload) then
      return r.id;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roles y perfiles (datos mínimos: sin email duplicado, sin teléfono, etc.)
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'trader', 'suscriptor');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role,                  -- null hasta completar el onboarding
  display_name text not null default 'Usuario'
               check (char_length(display_name) between 2 and 40),
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();

-- Perfil automático al crear el usuario (lo crea el servidor con service role).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

create policy "profiles: lectura para usuarios autenticados"
  on public.profiles for select to authenticated using (true);

create policy "profiles: el usuario edita su propio perfil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Solo se puede cambiar el nombre visible directamente. El rol se fija con
-- complete_onboarding() o por el admin con admin_set_role().
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.admin_set_role(p_user uuid, p_role public.user_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo admin' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'El admin no puede cambiar su propio rol';
  end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ajustes de plataforma (fila única, editable solo por admin, auditada)
-- -----------------------------------------------------------------------------
create type public.banned_terms_mode as enum ('block', 'review');

create table public.platform_settings (
  id                   boolean primary key default true check (id),
  platform_fee_bps     integer not null default 2500
                       check (platform_fee_bps between 0 and 10000),   -- 2500 = 25 %
  publish_delay_hours  integer not null default 24
                       check (publish_delay_hours between 0 and 720),
  banned_terms         text[] not null default array[
    'garantizado', 'garantizada', 'garantizamos', 'rentabilidad asegurada',
    'sin riesgo', 'riesgo cero', 'seguro que sube', 'dinero fácil',
    'no puedes perder', 'beneficio seguro', 'duplica tu dinero', 'hazte rico'
  ],
  banned_terms_mode    public.banned_terms_mode not null default 'review',
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

insert into public.platform_settings (id) values (true);

create or replace function private.settings_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger platform_settings_stamp before update on public.platform_settings
  for each row execute function private.settings_stamp();
create trigger platform_settings_audit after update on public.platform_settings
  for each row execute function private.audit_row_change();

alter table public.platform_settings enable row level security;

create policy "settings: lectura autenticados"
  on public.platform_settings for select to authenticated using (true);
create policy "settings: solo admin modifica"
  on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
grant update (platform_fee_bps, publish_delay_hours, banned_terms, banned_terms_mode)
  on public.platform_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Documentos legales (versionados) y aceptaciones registradas
-- Los textos viven en src/legal/documents.ts; aquí se registran clave+versión
-- y el hash del contenido que el usuario vio.
-- -----------------------------------------------------------------------------
create table public.legal_documents (
  key        text not null,
  version    text not null,
  title      text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (key, version)
);

create unique index legal_documents_one_current on public.legal_documents (key) where is_current;

insert into public.legal_documents (key, version, title) values
  ('terminos',               '2026-09-29-borrador', 'Términos y condiciones'),
  ('aviso_legal',            '2026-09-29-borrador', 'Aviso legal'),
  ('privacidad',             '2026-09-29-borrador', 'Política de privacidad'),
  ('consentimiento_rgpd',    '2026-09-29-borrador', 'Consentimiento para el tratamiento de datos'),
  ('no_asesoramiento',       '2026-09-29-borrador', 'Contenido educativo, no asesoramiento financiero'),
  ('desistimiento',          '2026-09-29-borrador', 'Información sobre el derecho de desistimiento');

alter table public.legal_documents enable row level security;
create policy "legal_documents: lectura autenticados"
  on public.legal_documents for select to authenticated using (true);
revoke all on public.legal_documents from anon, authenticated;
grant select on public.legal_documents to authenticated;

create type public.acceptance_context as enum ('registro', 'suscripcion', 'reaceptacion');

create table public.legal_acceptances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  doc_key       text not null,
  doc_version   text not null,
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  context       public.acceptance_context not null,
  context_ref   text,             -- p.ej. id del trader al que se suscribe
  accepted_at   timestamptz not null default now(),
  foreign key (doc_key, doc_version) references public.legal_documents (key, version)
);

create index legal_acceptances_user on public.legal_acceptances (user_id, doc_key);

create trigger legal_acceptances_audit after insert on public.legal_acceptances
  for each row execute function private.audit_row_change();
create trigger legal_acceptances_immutable before update on public.legal_acceptances
  for each row execute function private.audit_log_immutable();

alter table public.legal_acceptances enable row level security;
create policy "acceptances: el usuario ve las suyas; admin todas"
  on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;

-- Registra la aceptación de un conjunto de documentos (solo versiones vigentes).
-- p_docs: [{"key": "...", "version": "...", "hash": "..."}]
create or replace function public.accept_legal_documents(
  p_docs jsonb, p_context public.acceptance_context, p_context_ref text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) = 0 then
    raise exception 'Sin documentos que aceptar';
  end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    if not exists (select 1 from public.legal_documents
                   where key = d->>'key' and version = d->>'version' and is_current) then
      raise exception 'Documento % versión % no vigente', d->>'key', d->>'version';
    end if;
    insert into public.legal_acceptances (user_id, doc_key, doc_version, content_hash, context, context_ref)
    values (auth.uid(), d->>'key', d->>'version', d->>'hash', p_context, p_context_ref);
  end loop;
end;
$$;

-- ¿Ha aceptado el usuario la versión vigente de todos estos documentos?
create or replace function public.has_current_acceptances(p_keys text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.legal_documents ld
    where ld.is_current and ld.key = any (p_keys)
      and not exists (select 1 from public.legal_acceptances la
                      where la.user_id = auth.uid() and la.doc_key = ld.key
                        and la.doc_version = ld.version)
  );
$$;

-- Onboarding: nombre + rol (trader/suscriptor) + aceptaciones de registro.
-- El rol admin lo asigna el servidor según ADMIN_EMAIL; el admin conserva su rol.
create or replace function public.complete_onboarding(
  p_display_name text, p_role public.user_role, p_docs jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current public.user_role;
begin
  select role into v_current from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Perfil inexistente';
  end if;
  if v_current is distinct from 'admin' then
    if p_role not in ('trader', 'suscriptor') then
      raise exception 'Rol no permitido';
    end if;
    if v_current is not null and v_current <> p_role then
      raise exception 'El rol ya está fijado; solo el admin puede cambiarlo';
    end if;
  end if;

  perform public.accept_legal_documents(p_docs, 'registro');

  if not public.has_current_acceptances(array['terminos', 'aviso_legal', 'privacidad',
                                              'consentimiento_rgpd', 'no_asesoramiento']) then
    raise exception 'Faltan aceptaciones obligatorias';
  end if;

  update public.profiles
     set display_name = p_display_name,
         role = case when v_current = 'admin' then 'admin' else p_role end,
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- Lectura del log de auditoría: solo admin. Nadie tiene INSERT/UPDATE/DELETE.
-- -----------------------------------------------------------------------------
alter table public.audit_log enable row level security;
create policy "audit_log: solo admin lee"
  on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Endurecimiento de privilegios
-- -----------------------------------------------------------------------------
-- anon no accede a nada: toda la app requiere sesión.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

revoke all on all functions in schema private from public, anon, authenticated;
