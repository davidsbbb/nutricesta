-- Pruebas de la migración núcleo. Cada bloque lanza excepción si falla.
\set ON_ERROR_STOP on

-- Helper: ejecuta SQL como un usuario autenticado concreto.
create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void
language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
    if sqlerrm not ilike '%' || p_like || '%' and sqlstate <> p_like then
      raise exception 'Error inesperado para %: [%] %', p_sql, sqlstate, sqlerrm;
    end if;
  end;
  if not v_failed then
    raise exception 'ESPERABA ERROR (%) y no lo hubo: %', p_like, p_sql;
  end if;
end $$;

-- Allowlist en BD (el servidor la rellena con server_allow_email)
set role service_role;
select public.server_allow_email('admin@test.local');
select public.server_allow_email('trader@test.local');
select public.server_allow_email('SUB@test.local');
select pg_temp.expect_error($$select public.server_allow_email('cuarto@test.local')$$, 'máximo 3 emails');
reset role;
select pg_temp.expect_error($$insert into auth.users (email) values ('intruso@test.local')$$, 'no invitado');
set role authenticated;
select pg_temp.expect_error($$select public.server_allow_email('intruso@test.local')$$, '42501');
reset role;

-- Usuarios (como postgres/servidor)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'trader@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'sub@test.local');

-- 1. Tope de 3 usuarios
-- (se salta la allowlist insertando directamente para probar el tope)
insert into private.allowed_emails values ('cuarto@test.local');
select pg_temp.expect_error($$insert into auth.users (email) values ('cuarto@test.local')$$, 'máximo 3 usuarios');

-- 2. Perfiles creados automáticamente
do $$ begin
  assert (select count(*) from public.profiles) = 3, 'perfiles no creados';
end $$;

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

-- Documentos a aceptar
create temp table docs as
  select jsonb_agg(jsonb_build_object('key', key, 'version', version, 'hash', repeat('a', 64))) as j
  from public.legal_documents
  where key in ('terminos', 'aviso_legal', 'privacidad', 'consentimiento_rgpd', 'no_asesoramiento');
grant select on docs to authenticated;

-- 3. Como trader: no puede auto-asignarse admin ni cambiar su rol por UPDATE directo
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

select pg_temp.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501');
select pg_temp.expect_error($$select public.complete_onboarding('Trader', 'admin', (select j from docs))$$, 'Rol no permitido');
select pg_temp.expect_error(
  $$select public.complete_onboarding('Trader', 'trader', '[{"key":"terminos","version":"2026-09-29-borrador","hash":"$$ || repeat('a',64) || $$"}]')$$,
  'Faltan aceptaciones');
select public.complete_onboarding('Trader Uno', 'trader', (select j from docs));
do $$ begin
  assert public.current_user_role() = 'trader', 'rol trader no fijado';
  assert public.has_current_acceptances(array['terminos','privacidad']), 'aceptaciones no registradas';
end $$;
-- Tras fijar rol, no puede cambiarlo
select pg_temp.expect_error($$select public.complete_onboarding('Trader Uno', 'suscriptor', (select j from docs))$$, 'ya está fijado');
-- Puede cambiar su nombre visible, pero no el de otros
update public.profiles set display_name = 'Nuevo nombre' where id = auth.uid();
update public.profiles set display_name = 'Hackeado' where id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'Usuario', 'RLS profiles update';
end $$;

-- 4. Aceptaciones: no se pueden borrar ni editar
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_error($$delete from public.legal_acceptances$$, '42501');
select pg_temp.expect_error($$insert into public.legal_acceptances (user_id, doc_key, doc_version, content_hash, context) values (auth.uid(), 'terminos', 'x', repeat('a',64), 'registro')$$, '42501');

-- 5. Ajustes: el trader lee pero no modifica; audit_log invisible para no-admin
do $$ begin
  assert (select platform_fee_bps from public.platform_settings) = 2500, 'settings lectura';
  assert (select count(*) from public.audit_log) = 0, 'audit_log visible para trader';
end $$;
update public.platform_settings set platform_fee_bps = 0;
select pg_temp.expect_error($$insert into public.audit_log (action, entity_type, prev_hash, hash) values ('x','x','x','x')$$, '42501');
select pg_temp.expect_error($$select private.audit('x','x',null)$$, '42501');
select pg_temp.expect_error($$select public.verify_audit_chain()$$, 'Solo admin');
select pg_temp.expect_error($$select public.admin_set_role('00000000-0000-0000-0000-00000000000c', 'trader')$$, 'Solo admin');
reset role;
do $$ begin
  assert (select platform_fee_bps from public.platform_settings) = 2500, 'trader modificó settings';
end $$;

-- 6. Admin: modifica ajustes, ve el log y la cadena es válida
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.platform_settings set platform_fee_bps = 2000;
do $$ begin
  assert (select platform_fee_bps from public.platform_settings) = 2000, 'admin no pudo modificar';
  assert (select count(*) from public.audit_log) > 0, 'admin no ve audit_log';
  assert public.verify_audit_chain() is null, 'cadena de auditoría rota';
  assert exists (select 1 from public.audit_log where entity_type = 'legal_acceptances'), 'aceptaciones no auditadas';
  assert exists (select 1 from public.audit_log where entity_type = 'platform_settings'), 'ajustes no auditados';
end $$;
reset role;

-- 7. Inmutabilidad del log incluso para postgres/service_role
select pg_temp.expect_error($$update public.audit_log set action = 'x'$$, 'inmutable');
select pg_temp.expect_error($$delete from public.audit_log$$, 'inmutable');
select pg_temp.expect_error($$truncate public.audit_log$$, 'inmutable');

-- 8. anon no ve nada
set role anon;
select pg_temp.expect_error($$select * from public.profiles$$, '42501');
select pg_temp.expect_error($$select public.is_admin()$$, '42501');
reset role;

\echo '01_core: OK'
