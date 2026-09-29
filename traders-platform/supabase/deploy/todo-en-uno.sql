-- =============================================================================
-- FOCO · TODAS las migraciones en un solo fichero, para pegar en
-- Supabase → SQL Editor → New query → Run. Ejecutar UNA sola vez en un
-- proyecto vacío. Generado desde supabase/migrations (no editar a mano).
-- =============================================================================

-- >>> supabase/migrations/20260929000001_core.sql
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

-- >>> supabase/migrations/20260929000002_allowlist.sql
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

-- >>> supabase/migrations/20260929000003_traders_posts.sql
-- =============================================================================
-- FASE 2 · Perfil de trader, datos fiscales (DAC7), verificación de track
-- record y publicaciones con salvaguardas de cumplimiento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfil público del trader
-- -----------------------------------------------------------------------------
create type public.verification_status as enum ('pendiente', 'verificado', 'rechazado');

create table public.trader_profiles (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  bio                 text not null default '' check (char_length(bio) <= 1000),
  strategy            text not null default '' check (char_length(strategy) <= 1000),
  markets             text not null default '' check (char_length(markets) <= 200),
  trading_since       date check (trading_since <= current_date),
  return_12m_pct      numeric(7, 2) check (return_12m_pct between -100 and 10000),
  max_drawdown_pct    numeric(5, 2) check (max_drawdown_pct between 0 and 100),
  metrics_as_of       date check (metrics_as_of <= current_date),
  verification_status public.verification_status not null default 'pendiente',
  verification_note   text,
  verified_at         timestamptz,
  verified_by         uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trader_profiles_touch before update on public.trader_profiles
  for each row execute function private.touch_updated_at();

-- Si el trader cambia sus métricas, la verificación vuelve a "pendiente".
create or replace function private.trader_metrics_changed()
returns trigger language plpgsql as $$
begin
  if (new.return_12m_pct, new.max_drawdown_pct, new.trading_since, new.metrics_as_of)
     is distinct from
     (old.return_12m_pct, old.max_drawdown_pct, old.trading_since, old.metrics_as_of)
     and new.verification_status = old.verification_status
     and old.verification_status = 'verificado' then
    new.verification_status := 'pendiente';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := 'Métricas modificadas: requiere nueva verificación.';
  end if;
  return new;
end;
$$;

create trigger trader_profiles_metrics before update on public.trader_profiles
  for each row execute function private.trader_metrics_changed();

create trigger trader_profiles_audit after insert or update or delete on public.trader_profiles
  for each row execute function private.audit_row_change();

alter table public.trader_profiles enable row level security;

create policy "trader_profiles: lectura autenticados"
  on public.trader_profiles for select to authenticated using (true);
create policy "trader_profiles: el trader crea el suyo"
  on public.trader_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_role() = 'trader');
create policy "trader_profiles: el trader edita el suyo"
  on public.trader_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.trader_profiles from anon, authenticated;
grant select on public.trader_profiles to authenticated;
-- El estado de verificación NO es editable por el trader.
grant insert (user_id, bio, strategy, markets, trading_since, return_12m_pct, max_drawdown_pct, metrics_as_of),
      update (bio, strategy, markets, trading_since, return_12m_pct, max_drawdown_pct, metrics_as_of)
  on public.trader_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Datos fiscales (futuro DAC7). Solo el propio trader y el admin.
-- -----------------------------------------------------------------------------
create table public.trader_tax_info (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  tax_id      text not null check (tax_id ~ '^[A-Z0-9-]{5,20}$'),
  tax_country char(2) not null check (tax_country ~ '^[A-Z]{2}$'),
  updated_at  timestamptz not null default now()
);

create trigger trader_tax_touch before update on public.trader_tax_info
  for each row execute function private.touch_updated_at();
-- El NIF nunca entra en el log de auditoría.
create trigger trader_tax_audit after insert or update or delete on public.trader_tax_info
  for each row execute function private.audit_row_change('tax_id');

alter table public.trader_tax_info enable row level security;
create policy "tax: el propio trader o admin leen"
  on public.trader_tax_info for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "tax: el trader crea los suyos"
  on public.trader_tax_info for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_role() = 'trader');
create policy "tax: el trader edita los suyos"
  on public.trader_tax_info for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.trader_tax_info from anon, authenticated;
grant select, insert (user_id, tax_id, tax_country), update (tax_id, tax_country)
  on public.trader_tax_info to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación de track record: extractos subidos + aprobación manual admin
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statements', 'statements', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Ruta: <trader_id>/<fichero>. Los extractos son evidencia: no se editan ni
-- se borran desde la app (el borrado RGPD lo hace el servidor).
create policy "statements: el trader sube a su carpeta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'statements'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.current_user_role() = 'trader');
create policy "statements: el trader ve los suyos y el admin todos"
  on storage.objects for select to authenticated
  using (bucket_id = 'statements'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create table public.track_record_statements (
  id            uuid primary key default gen_random_uuid(),
  trader_id     uuid not null references public.profiles (id) on delete cascade,
  file_path     text not null unique,
  file_name     text not null check (char_length(file_name) <= 200),
  period_start  date not null,
  period_end    date not null check (period_end >= period_start and period_end <= current_date),
  status        public.verification_status not null default 'pendiente',
  review_note   text check (char_length(review_note) <= 1000),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  check (file_path like trader_id::text || '/%')
);

create trigger statements_audit after insert or update on public.track_record_statements
  for each row execute function private.audit_row_change();

alter table public.track_record_statements enable row level security;
create policy "statements: el trader ve los suyos y el admin todos"
  on public.track_record_statements for select to authenticated
  using (trader_id = auth.uid() or public.is_admin());
create policy "statements: el trader registra los suyos"
  on public.track_record_statements for insert to authenticated
  with check (trader_id = auth.uid() and public.current_user_role() = 'trader');

revoke all on public.track_record_statements from anon, authenticated;
grant select, insert (trader_id, file_path, file_name, period_start, period_end)
  on public.track_record_statements to authenticated;

create or replace function public.admin_review_statement(
  p_id uuid, p_approve boolean, p_note text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_trader uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo admin' using errcode = 'insufficient_privilege';
  end if;
  update public.track_record_statements
     set status = case when p_approve then 'verificado' else 'rechazado' end::public.verification_status,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pendiente'
  returning trader_id into v_trader;
  if v_trader is null then
    raise exception 'Extracto inexistente o ya revisado';
  end if;

  insert into public.trader_profiles (user_id) values (v_trader) on conflict (user_id) do nothing;
  update public.trader_profiles
     set verification_status = case when p_approve then 'verificado' else 'rechazado' end::public.verification_status,
         verification_note = p_note,
         verified_at = case when p_approve then now() end,
         verified_by = case when p_approve then auth.uid() end
   where user_id = v_trader;
end;
$$;

-- -----------------------------------------------------------------------------
-- Filtro de palabras prohibidas / promesas de rentabilidad
-- -----------------------------------------------------------------------------
alter table public.platform_settings
  add column banned_patterns text[] not null default array[
    -- "X % al mes / semanal / diario..." (promesa de rentabilidad periódica)
    '\d+([.,]\d+)?\s*%\s*(mensual|semanal|diari[oa]|anual|al mes|a la semana|al dia|al ano|cada mes)',
    'rentabilidad(es)?\s+(asegurada|garantizada|fija|segura)s?',
    'ganancias?\s+(asegurada|garantizada|segura)s?',
    '(vas|vais|van) a ganar',
    'no (hay|tiene|existe) (ningun )?riesgo',
    '(multiplica|triplica|duplica)r? (tu|vuestro|el) (dinero|capital|inversion)'
  ];

grant update (banned_patterns) on public.platform_settings to authenticated;

-- Un patrón inválido rompería el filtro (y con él, todas las publicaciones):
-- se valida al guardar.
create or replace function private.validate_banned_patterns()
returns trigger language plpgsql as $$
declare
  p text;
begin
  foreach p in array new.banned_patterns loop
    begin
      perform regexp_match('', p);
    exception when others then
      raise exception 'Patrón no válido: %', p using errcode = 'check_violation';
    end;
  end loop;
  return new;
end;
$$;

create trigger platform_settings_patterns before insert or update of banned_patterns on public.platform_settings
  for each row execute function private.validate_banned_patterns();

-- Normaliza: minúsculas y sin tildes, para que "Garantízado" o "GARANTIZADO" casen.
create or replace function private.normalize_text(p text)
returns text language sql immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
$$;

create or replace function public.find_banned_terms(p_text text)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_norm text := private.normalize_text(p_text);
  v_settings public.platform_settings;
  v_found text[] := '{}';
  v_item text;
  v_match text[];
begin
  select * into v_settings from public.platform_settings where id;
  foreach v_item in array v_settings.banned_terms loop
    if position(private.normalize_text(v_item) in v_norm) > 0 then
      v_found := v_found || v_item;
    end if;
  end loop;
  foreach v_item in array v_settings.banned_patterns loop
    v_match := regexp_match(v_norm, v_item);
    if v_match is not null then
      v_found := v_found || (regexp_match(v_norm, '(' || v_item || ')'))[1];
    end if;
  end loop;
  return v_found;
end;
$$;

-- -----------------------------------------------------------------------------
-- Publicaciones (carteras / tesis), iguales para todos los suscriptores
-- -----------------------------------------------------------------------------
create type public.post_kind as enum ('cartera', 'tesis');
create type public.post_status as enum ('en_revision', 'programada', 'rechazada', 'retirada');
create type public.market_view as enum ('alcista', 'bajista', 'neutral');
create type public.own_position as enum ('ninguna', 'larga', 'corta');
create type public.trade_side as enum ('compra', 'venta');

create table public.posts (
  id                   uuid primary key default gen_random_uuid(),
  trader_id            uuid not null references public.profiles (id) on delete cascade,
  kind                 public.post_kind not null,
  title                text not null check (char_length(title) between 5 and 140),
  body                 text not null check (char_length(body) between 20 and 20000),
  conflicts_of_interest text not null check (char_length(conflicts_of_interest) between 2 and 1000),
  risk_ack             boolean not null check (risk_ack),
  status               public.post_status not null,
  flagged_terms        text[] not null default '{}',
  submitted_at         timestamptz not null default now(),
  publish_at           timestamptz not null,
  review_note          text,
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  updated_at           timestamptz not null default now()
);

create index posts_trader_publish on public.posts (trader_id, publish_at desc);

create table public.post_assets (
  post_id        uuid not null references public.posts (id) on delete cascade,
  asset          text not null check (asset ~ '^[A-Z0-9.:\- ]{1,40}$'),
  view           public.market_view not null,
  own_position   public.own_position not null,
  -- Operación del trader en este activo en los últimos 30 días, si la hubo.
  recent_trade   public.trade_side,
  recent_trade_at timestamptz,
  -- ¿Tiene intención de operar en sentido contrario a lo publicado?
  opposite_intent boolean not null default false,
  primary key (post_id, asset),
  check ((recent_trade is null) = (recent_trade_at is null))
);

create table public.post_revisions (
  id                    bigint generated always as identity primary key,
  post_id               uuid not null references public.posts (id) on delete cascade,
  title                 text not null,
  body                  text not null,
  conflicts_of_interest text not null,
  replaced_at           timestamptz not null default now()
);

create trigger posts_touch before update on public.posts
  for each row execute function private.touch_updated_at();
create trigger posts_audit after insert or update or delete on public.posts
  for each row execute function private.audit_row_change('body');
create trigger post_assets_audit after insert on public.post_assets
  for each row execute function private.audit_row_change();
create trigger post_revisions_audit after insert on public.post_revisions
  for each row execute function private.audit_row_change('body');
create trigger post_assets_immutable before update on public.post_assets
  for each row execute function private.audit_log_immutable();
create trigger post_revisions_immutable before update or delete on public.post_revisions
  for each row execute function private.audit_log_immutable();

-- ¿Puede el usuario actual leer el contenido de este trader?
-- Fase 2: el propio trader y el admin. La fase 3 lo amplía a suscriptores activos.
create or replace function public.can_read_trader_content(p_trader uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() = p_trader or public.is_admin();
$$;

create or replace function public.post_is_live(p public.posts)
returns boolean language sql stable
set search_path = ''
as $$
  select p.status = 'programada' and p.publish_at <= now();
$$;

alter table public.posts enable row level security;
alter table public.post_assets enable row level security;
alter table public.post_revisions enable row level security;

create policy "posts: autor, admin o lector con acceso (ya publicadas)"
  on public.posts for select to authenticated
  using (trader_id = auth.uid() or public.is_admin()
         or (public.post_is_live(posts) and public.can_read_trader_content(trader_id)));
create policy "post_assets: mismas reglas que el post"
  on public.post_assets for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "post_revisions: autor y admin"
  on public.post_revisions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
                 and (p.trader_id = auth.uid() or public.is_admin())));

-- Escritura solo mediante las funciones de abajo.
revoke all on public.posts, public.post_assets, public.post_revisions from anon, authenticated;
grant select on public.posts, public.post_assets, public.post_revisions to authenticated;

-- Crea una publicación con todas las salvaguardas.
-- p_assets: [{"asset":"AAPL","view":"alcista","own_position":"larga",
--             "recent_trade":null,"recent_trade_at":null,"opposite_intent":false}]
create or replace function public.create_post(
  p_kind public.post_kind,
  p_title text,
  p_body text,
  p_conflicts text,
  p_risk_ack boolean,
  p_assets jsonb
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_settings public.platform_settings;
  v_flags text[];
  v_status public.post_status;
  a jsonb;
  v_view public.market_view;
  v_pos public.own_position;
  v_trade public.trade_side;
begin
  if public.current_user_role() is distinct from 'trader' then
    raise exception 'Solo los traders pueden publicar' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_risk_ack, false) then
    raise exception 'Debes aceptar el aviso de riesgos';
  end if;
  if jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) = 0 then
    raise exception 'Declara al menos un activo mencionado y tu posición en él';
  end if;

  -- Bloqueo por operación en sentido contrario.
  for a in select * from jsonb_array_elements(p_assets) loop
    v_view  := (a->>'view')::public.market_view;
    v_pos   := (a->>'own_position')::public.own_position;
    v_trade := nullif(a->>'recent_trade', '')::public.trade_side;
    if coalesce((a->>'opposite_intent')::boolean, false)
       or (v_view = 'alcista' and (v_pos = 'corta' or v_trade = 'venta'))
       or (v_view = 'bajista' and (v_pos = 'larga' or v_trade = 'compra')) then
      raise exception 'Publicación bloqueada: has operado o vas a operar en sentido contrario en %', a->>'asset'
        using errcode = 'check_violation';
    end if;
  end loop;

  select * into v_settings from public.platform_settings where id;
  v_flags := public.find_banned_terms(concat_ws(' ', p_title, p_body, p_conflicts));
  if cardinality(v_flags) > 0 and v_settings.banned_terms_mode = 'block' then
    raise exception 'Publicación bloqueada por expresiones prohibidas: %', array_to_string(v_flags, ', ')
      using errcode = 'check_violation';
  end if;
  v_status := case when cardinality(v_flags) > 0 then 'en_revision' else 'programada' end;

  insert into public.posts (trader_id, kind, title, body, conflicts_of_interest, risk_ack,
                            status, flagged_terms, publish_at)
  values (auth.uid(), p_kind, p_title, p_body, p_conflicts, p_risk_ack, v_status, v_flags,
          now() + make_interval(hours => v_settings.publish_delay_hours))
  returning id into v_id;

  insert into public.post_assets (post_id, asset, view, own_position, recent_trade, recent_trade_at, opposite_intent)
  select v_id, upper(trim(x->>'asset')), (x->>'view')::public.market_view,
         (x->>'own_position')::public.own_position,
         nullif(x->>'recent_trade', '')::public.trade_side,
         nullif(x->>'recent_trade_at', '')::timestamptz,
         coalesce((x->>'opposite_intent')::boolean, false)
    from jsonb_array_elements(p_assets) x;

  return v_id;
end;
$$;

-- Edita texto/conflictos. Guarda la versión anterior (inmutable) y vuelve a
-- pasar el filtro. Los activos y posiciones no se editan: publicación nueva.
create or replace function public.edit_post(
  p_id uuid, p_title text, p_body text, p_conflicts text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_settings public.platform_settings;
  v_flags text[];
begin
  select * into v_post from public.posts where id = p_id and trader_id = auth.uid() for update;
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'insufficient_privilege';
  end if;
  if v_post.status in ('retirada', 'rechazada') then
    raise exception 'No se puede editar una publicación %', v_post.status;
  end if;

  select * into v_settings from public.platform_settings where id;
  v_flags := public.find_banned_terms(concat_ws(' ', p_title, p_body, p_conflicts));
  if cardinality(v_flags) > 0 and v_settings.banned_terms_mode = 'block' then
    raise exception 'Edición bloqueada por expresiones prohibidas: %', array_to_string(v_flags, ', ')
      using errcode = 'check_violation';
  end if;

  insert into public.post_revisions (post_id, title, body, conflicts_of_interest)
  values (v_post.id, v_post.title, v_post.body, v_post.conflicts_of_interest);

  update public.posts
     set title = p_title, body = p_body, conflicts_of_interest = p_conflicts,
         flagged_terms = v_flags,
         status = case when cardinality(v_flags) > 0 then 'en_revision' else status end
   where id = p_id;
end;
$$;

create or replace function public.withdraw_post(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.posts set status = 'retirada'
   where id = p_id and (trader_id = auth.uid() or public.is_admin()) and status <> 'retirada';
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.admin_review_post(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo admin' using errcode = 'insufficient_privilege';
  end if;
  update public.posts
     set status = case when p_approve then 'programada' else 'rechazada' end::public.post_status,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'en_revision';
  if not found then
    raise exception 'Publicación inexistente o no está en revisión';
  end if;
end;
$$;

-- Datos objetivos y públicos (para el listado y el ranking neutro).
create or replace function public.trader_public_stats()
returns table (trader_id uuid, published_posts bigint, last_published_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.trader_id, count(*), max(p.publish_at)
    from public.posts p
   where p.status = 'programada' and p.publish_at <= now()
   group by p.trader_id;
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on function public.server_allow_email(text) from authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
