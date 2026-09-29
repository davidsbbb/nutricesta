-- Pruebas de la fase 2. Se ejecuta tras 01_core (reutiliza sus usuarios):
--   ...0a admin · ...0b trader · ...0c (se hace suscriptor aquí)
\set ON_ERROR_STOP on
\ir _helpers.psql

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set trader '''00000000-0000-0000-0000-00000000000b'''
\set sub '''00000000-0000-0000-0000-00000000000c'''

create temp table docs as
  select jsonb_agg(jsonb_build_object('key', key, 'version', version, 'hash', repeat('a', 64))) as j
  from public.legal_documents
  where key in ('terminos', 'aviso_legal', 'privacidad', 'consentimiento_rgpd', 'no_asesoramiento');
grant select on docs to authenticated;
create temp table ids (name text, id uuid);
grant all on ids to authenticated;

set role authenticated;

-- El tercer usuario completa el registro como suscriptor
select pg_temp.login(:sub);
select public.complete_onboarding('Suscriptor', 'suscriptor', (select j from docs));

-- 1. Perfil de trader: solo traders; verificación no editable por el trader
select pg_temp.expect_error($$insert into public.trader_profiles (user_id, bio) values (auth.uid(), 'x')$$, '42501');
select pg_temp.login(:trader);
insert into public.trader_profiles (user_id, bio, strategy, return_12m_pct, max_drawdown_pct, trading_since)
values (auth.uid(), 'Bio', 'Value investing', 12.5, 18, '2019-01-01');
select pg_temp.expect_error($$update public.trader_profiles set verification_status = 'verificado' where user_id = auth.uid()$$, '42501');

-- 2. Datos fiscales: el trader los ve, el suscriptor no
insert into public.trader_tax_info (user_id, tax_id, tax_country) values (auth.uid(), '12345678Z', 'ES');
select pg_temp.expect_error($$update public.trader_tax_info set tax_id = 'x' where user_id = auth.uid()$$, '23514');
select pg_temp.expect_error($$update public.trader_tax_info set tax_country = 'es' where user_id = auth.uid()$$, '23514');
select pg_temp.login(:sub);
do $$ begin
  assert (select count(*) from public.trader_tax_info) = 0, 'suscriptor ve datos fiscales';
  assert (select count(*) from public.trader_profiles) = 1, 'suscriptor no ve perfiles públicos';
end $$;

-- 3. Extractos: el trader sube a su carpeta, no a la de otro; admin aprueba
select pg_temp.login(:trader);
insert into storage.objects (bucket_id, name) values ('statements', '00000000-0000-0000-0000-00000000000b/ext.pdf');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('statements', '00000000-0000-0000-0000-00000000000c/x.pdf')$$, '42501');
insert into public.track_record_statements (trader_id, file_path, file_name, period_start, period_end)
values (auth.uid(), '00000000-0000-0000-0000-00000000000b/ext.pdf', 'ext.pdf', '2024-01-01', '2024-12-31');
select pg_temp.expect_error($$insert into public.track_record_statements (trader_id, file_path, file_name, period_start, period_end, status) values (auth.uid(), '00000000-0000-0000-0000-00000000000b/y.pdf', 'y.pdf', '2024-01-01', '2024-12-31', 'verificado')$$, '42501');
select pg_temp.expect_error($$select public.admin_review_statement((select id from public.track_record_statements limit 1), true)$$, 'Solo admin');
select pg_temp.login(:sub);
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'suscriptor ve extractos';
end $$;
select pg_temp.login(:admin);
select public.admin_review_statement((select id from public.track_record_statements limit 1), true, 'OK');
do $$ begin
  assert (select verification_status from public.trader_profiles) = 'verificado', 'no verificado';
end $$;
-- Si el trader cambia sus métricas, vuelve a pendiente
select pg_temp.login(:trader);
update public.trader_profiles set return_12m_pct = 50 where user_id = auth.uid();
do $$ begin
  assert (select verification_status from public.trader_profiles) = 'pendiente', 'métricas cambiadas siguen verificadas';
end $$;

-- 4. Publicaciones
-- 4a. Solo traders
select pg_temp.login(:sub);
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', true, '[{"asset":"AAPL","view":"alcista","own_position":"ninguna"}]')$$, 'Solo los traders');
select pg_temp.login(:trader);
-- 4b. Declaraciones obligatorias
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', false, '[{"asset":"AAPL","view":"alcista","own_position":"ninguna"}]')$$, 'aviso de riesgos');
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', true, '[]')$$, 'al menos un activo');
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), '', true, '[{"asset":"AAPL","view":"alcista","own_position":"ninguna"}]')$$, '23514');
-- 4c. Operación en sentido contrario => bloqueo
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', true, '[{"asset":"AAPL","view":"alcista","own_position":"corta"}]')$$, 'sentido contrario');
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', true, '[{"asset":"AAPL","view":"bajista","own_position":"ninguna","recent_trade":"compra","recent_trade_at":"2026-09-20T10:00:00Z"}]')$$, 'sentido contrario');
select pg_temp.expect_error($$select public.create_post('tesis', 'Título ok', repeat('texto ', 10), 'Ninguno', true, '[{"asset":"AAPL","view":"alcista","own_position":"larga","opposite_intent":true}]')$$, 'sentido contrario');
-- 4d. Publicación limpia: programada con retraso de 24 h
insert into ids select 'limpia', public.create_post('tesis', 'Tesis sobre Apple', 'Análisis general del negocio y valoración.', 'Tengo acciones de AAPL', true,
  '[{"asset":"aapl","view":"alcista","own_position":"larga"}]');
do $$ begin
  assert (select status from public.posts where id = (select id from ids where name='limpia')) = 'programada', 'no programada';
  assert (select publish_at - submitted_at from public.posts where id = (select id from ids where name='limpia')) = interval '24 hours', 'retraso incorrecto';
  assert (select asset from public.post_assets where post_id = (select id from ids where name='limpia')) = 'AAPL', 'activo no normalizado';
end $$;
-- 4e. Palabras prohibidas (modo revisión por defecto), con tildes/mayúsculas y promesas
insert into ids select 'prohibida', public.create_post('cartera', 'Cartera GARANTÍZADA', 'Rentabilidad del 5 % mensual para todos.', 'Ninguno', true,
  '[{"asset":"SPY","view":"alcista","own_position":"ninguna"}]');
do $$
declare f text[];
begin
  select flagged_terms into f from public.posts where id = (select id from ids where name='prohibida');
  assert (select status from public.posts where id = (select id from ids where name='prohibida')) = 'en_revision', 'no marcada para revisión';
  assert 'garantizado' = any (f) or 'garantizada' = any (f), 'no detecta garantizado';
  assert exists (select 1 from unnest(f) t where t like '5 % mensual%'), 'no detecta promesa de rentabilidad: ' || f::text;
end $$;
-- 4f. Nadie escribe en posts directamente
select pg_temp.expect_error($$update public.posts set status = 'programada'$$, '42501');
select pg_temp.expect_error($$insert into public.posts (trader_id, kind, title, body, conflicts_of_interest, risk_ack, status, publish_at) values (auth.uid(), 'tesis', 'xxxxx', repeat('x', 30), 'no', true, 'programada', now())$$, '42501');
-- 4g. Edición: guarda revisión y vuelve a filtrar
select public.edit_post((select id from ids where name='limpia'), 'Tesis sobre Apple v2', 'Ahora es sin riesgo, seguro que sube.', 'Tengo acciones de AAPL');
do $$ begin
  assert (select count(*) from public.post_revisions) = 1, 'revisión no guardada';
  assert (select status from public.posts where id = (select id from ids where name='limpia')) = 'en_revision', 'edición no re-filtrada';
end $$;

-- 5. Visibilidad: el suscriptor (sin suscripción, fase 3) no ve contenido
select pg_temp.login(:sub);
do $$ begin
  assert (select count(*) from public.posts) = 0, 'suscriptor ve publicaciones sin acceso';
  assert (select count(*) from public.post_assets) = 0, 'suscriptor ve activos sin acceso';
end $$;

-- 6. Admin revisa; modo "bloquear"
select pg_temp.login(:admin);
select public.admin_review_post((select id from ids where name='prohibida'), false, 'Promesa de rentabilidad');
do $$ begin
  assert (select status from public.posts where id = (select id from ids where name='prohibida')) = 'rechazada', 'no rechazada';
end $$;
update public.platform_settings set banned_terms_mode = 'block';
select pg_temp.login(:trader);
select pg_temp.expect_error($$select public.create_post('tesis', 'Sin riesgo', repeat('texto ', 10), 'Ninguno', true, '[{"asset":"AAPL","view":"alcista","own_position":"ninguna"}]')$$, 'expresiones prohibidas');
select public.withdraw_post((select id from ids where name='limpia'));
select pg_temp.expect_error($$select public.edit_post((select id from ids where name='limpia'), 'xxxxxx', repeat('x', 30), 'no')$$, 'retirada');

-- 7. Auditoría: publicaciones, ediciones y revisiones registradas; cadena íntegra; sin NIF
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where entity_type = 'posts' and action = 'insert'), 'post no auditado';
  assert exists (select 1 from public.audit_log where entity_type = 'post_revisions'), 'edición no auditada';
  assert not exists (select 1 from public.audit_log where payload::text like '%12345678Z%'), 'NIF en auditoría';
end $$;
set role authenticated;
select pg_temp.login(:admin);
do $$ begin
  assert public.verify_audit_chain() is null, 'cadena rota';
end $$;
reset role;

\echo '02_traders_posts: OK'
