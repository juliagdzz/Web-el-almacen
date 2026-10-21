-- Esquema de El Almacén en Supabase. Pégalo entero en SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- Una fila por cosa guardada (tablero, foto del tablero, pieza, receta o ajuste).
-- «datos» es el mismo objeto que la web guarda en el móvil, con las fotos
-- cambiadas por su ruta en el almacén de fotos.
create table if not exists public.registros (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  almacen text not null,
  id text not null,
  datos jsonb,
  borrado boolean not null default false,
  actualizado timestamptz not null default now(),
  primary key (user_id, almacen, id)
);
create index if not exists registros_por_fecha on public.registros (user_id, actualizado);

-- La fecha la pone siempre el servidor: así cada móvil sabe qué le falta por bajar
create or replace function public.registros_tocar() returns trigger
language plpgsql as $$
begin
  new.actualizado := clock_timestamp();
  return new;
end $$;
drop trigger if exists registros_tocar on public.registros;
create trigger registros_tocar before insert or update on public.registros
  for each row execute function public.registros_tocar();

-- Cada persona solo ve y toca lo suyo
alter table public.registros enable row level security;
drop policy if exists "Cada persona lo suyo" on public.registros;
create policy "Cada persona lo suyo" on public.registros
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fotos: privadas, cada persona en su carpeta (su id de usuario)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Fotos propias: ver" on storage.objects;
create policy "Fotos propias: ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Fotos propias: subir" on storage.objects;
create policy "Fotos propias: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Fotos propias: borrar" on storage.objects;
create policy "Fotos propias: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Encargos de piezas a medida
-- ============================================================

-- Quién lleva el taller: solo estos correos ven los encargos.
-- Después de crear tu cuenta en la web, ejecuta (con tu correo):
--   insert into public.admins (correo) values ('tu-correo@ejemplo.com') on conflict do nothing;
create table if not exists public.admins (correo text primary key);
alter table public.admins enable row level security; -- nadie la lee desde la web

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(correo) = lower(auth.jwt() ->> 'email'))
$$;
grant execute on function public.es_admin() to anon, authenticated;

create table if not exists public.encargos (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  -- lo que rellena quien encarga
  nombre text not null check (length(nombre) between 1 and 120),
  correo text check (length(correo) <= 200),
  telefono text check (length(telefono) <= 40),
  contestar_por text not null default 'correo' check (contestar_por in ('correo', 'whatsapp')),
  tipo text check (length(tipo) <= 60),
  cantidad int check (cantidad between 1 and 500),
  medidas text check (length(medidas) <= 300),
  colores text check (length(colores) <= 300),
  uso text check (length(uso) <= 60),
  idea text not null check (length(idea) between 1 and 5000),
  para_cuando date,
  presupuesto_cliente text check (length(presupuesto_cliente) <= 60),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 8),
  tablero jsonb,
  -- lo rellenas tú
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'presupuestado', 'aceptado', 'en-proceso', 'terminado', 'entregado', 'descartado')),
  precio numeric(8, 2),
  plazo text,
  notas text,
  constraint con_contacto check (coalesce(correo, '') <> '' or coalesce(telefono, '') <> '')
);
create index if not exists encargos_por_fecha on public.encargos (creado desc);
alter table public.encargos enable row level security;

drop policy if exists "Cualquiera puede enviar un encargo" on public.encargos;
create policy "Cualquiera puede enviar un encargo" on public.encargos for insert to anon, authenticated
  with check (estado = 'nuevo' and precio is null and plazo is null and notas is null
              and (user_id is null or user_id = auth.uid()));
drop policy if exists "El taller ve los encargos" on public.encargos;
create policy "El taller ve los encargos" on public.encargos for select to authenticated using (public.es_admin());
drop policy if exists "El taller cambia los encargos" on public.encargos;
create policy "El taller cambia los encargos" on public.encargos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists "El taller borra los encargos" on public.encargos;
create policy "El taller borra los encargos" on public.encargos for delete to authenticated using (public.es_admin());

-- Fotos de los encargos: cualquiera sube (en la carpeta del encargo), solo el taller las ve
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('encargos', 'encargos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Encargos: subir fotos" on storage.objects;
create policy "Encargos: subir fotos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'encargos');
drop policy if exists "Encargos: el taller ve las fotos" on storage.objects;
create policy "Encargos: el taller ve las fotos" on storage.objects for select to authenticated
  using (bucket_id = 'encargos' and public.es_admin());
drop policy if exists "Encargos: el taller borra las fotos" on storage.objects;
create policy "Encargos: el taller borra las fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'encargos' and public.es_admin());

-- ============================================================
-- Aviso por correo de cada encargo nuevo (con Resend)
-- ============================================================
-- La base de datos llama a Resend cuando entra un encargo y te manda un correo
-- a los correos de admins. Necesita la clave de Resend guardada en la caja
-- fuerte de Supabase (Vault). Ejecútalo una vez, aparte, con tu clave:
--   select vault.create_secret('re_TU_CLAVE', 'resend_api_key');
-- Para cambiarla más adelante:
--   select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_NUEVA');
-- Sin clave guardada no se manda nada y los encargos se guardan igual.

create extension if not exists pg_net with schema extensions;

create or replace function public.avisar_encargo() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  clave text;
  destinatarios text[];
  limpio text := regexp_replace(coalesce(new.nombre, ''), '\s+', ' ', 'g');
  texto text;
begin
  select decrypted_secret into clave from vault.decrypted_secrets where name = 'resend_api_key';
  select array_agg(correo) into destinatarios from public.admins;
  if clave is null or destinatarios is null then
    return new;
  end if;

  -- Correo en texto plano: lo que escribe la gente nunca se interpreta como HTML
  texto := concat_ws(E'\n',
    'Tienes un encargo nuevo en El Almacén.',
    '',
    coalesce(new.tipo, 'Pieza') || case when new.cantidad > 1 then ' × ' || new.cantidad else '' end
      || coalesce(' · ' || new.uso, ''),
    'De: ' || limpio,
    'Teléfono: ' || new.telefono,
    'Correo: ' || new.correo,
    'Prefiere que le contestes por ' || case new.contestar_por when 'whatsapp' then 'WhatsApp' else 'correo' end,
    'Tamaño: ' || new.medidas,
    'Colores: ' || new.colores,
    'Para: ' || to_char(new.para_cuando, 'DD/MM/YYYY'),
    'Quiere gastar: ' || new.presupuesto_cliente,
    '',
    left(new.idea, 1500),
    '',
    case when cardinality(new.fotos) > 0 or new.tablero is not null
      then 'Adjunta ' || cardinality(new.fotos) || ' foto(s)' || case when new.tablero is not null then ' y un tablero' else '' end || '.'
    end,
    '',
    'Míralo y contesta desde tu panel:',
    'https://webelalmacen.vercel.app/panel.html'
  );

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave, 'Content-Type', 'application/json'),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', 'El Almacén <onboarding@resend.dev>',
      'to', to_jsonb(destinatarios),
      'reply_to', nullif(new.correo, ''),
      'subject', left('Nuevo encargo: ' || lower(coalesce(new.tipo, 'pieza')) || ' de ' || limpio, 150),
      'text', texto
    ))
  );
  return new;
exception when others then
  -- Si el aviso falla, el encargo se guarda igual
  return new;
end $$;

revoke all on function public.avisar_encargo() from public, anon, authenticated;

drop trigger if exists avisar_encargo on public.encargos;
create trigger avisar_encargo after insert on public.encargos
  for each row execute function public.avisar_encargo();

-- ============================================================
-- Talleres: horarios, talleres de un día, bonos y reservas
-- ============================================================
-- Toda la lógica de plazas va aquí, en funciones de la base de datos: así dos
-- personas que reservan a la vez nunca pasan del aforo. La web solo las llama.
--   · Mensualidad fija: un horario fijo todo el mes, con el puesto guardado.
--     Hasta el día 24, el mes siguiente solo lo puede pedir quien ya lo tiene.
--   · Bono de 4 sesiones (caduca a los 2 meses) y pack de 10 clases (4 meses):
--     se reserva clase a clase, como mucho 14 días antes, y se cancela hasta 24 h antes.
--   · Talleres de un día: plazas propias; se cancela hasta 48 h antes.
-- Nada se paga en la web: los bonos se piden aquí y el taller los activa al cobrarlos.

create or replace function public.hoy_madrid() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;
create or replace function public.ahora_madrid() returns timestamp
language sql stable as $$ select now() at time zone 'Europe/Madrid' $$;

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  dia smallint not null check (dia between 1 and 7), -- 1 lunes … 7 domingo
  hora time not null,
  duracion int not null default 120 check (duracion between 30 and 480),
  plazas int not null default 6 check (plazas between 1 and 50),
  actividad text not null default 'Torno y modelado' check (length(actividad) between 1 and 80),
  activo boolean not null default true,
  creado timestamptz not null default now()
);

create table if not exists public.cierres (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  horario_id uuid references public.horarios on delete cascade, -- vacío: todo el día
  motivo text check (length(motivo) <= 120)
);

create table if not exists public.talleres (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 1 and 120),
  descripcion text check (length(descripcion) <= 2000),
  fecha date not null,
  hora time not null,
  duracion int not null default 180 check (duracion between 30 and 720),
  plazas int not null default 8 check (plazas between 1 and 100),
  precio numeric(8, 2) check (precio >= 0),
  publicado boolean not null default true,
  creado timestamptz not null default now()
);

create table if not exists public.bonos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tipo text not null check (tipo in ('mensual', 'bono4', 'pack10')),
  sesiones int not null check (sesiones between 1 and 31),
  horario_id uuid references public.horarios on delete set null, -- mensualidad: su horario fijo
  mes date,                                                      -- mensualidad: día 1 del mes
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activo', 'cancelado')),
  caduca date,
  nombre text not null check (length(nombre) between 1 and 120),
  telefono text check (length(telefono) <= 40),
  creado timestamptz not null default now(),
  activado timestamptz
);
create index if not exists bonos_por_horario on public.bonos (horario_id, mes) where tipo = 'mensual';

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  bono_id uuid references public.bonos on delete cascade,
  horario_id uuid references public.horarios on delete cascade,
  fecha date,
  taller_id uuid references public.talleres on delete cascade,
  nombre text,
  telefono text,
  estado text not null default 'confirmada' check (estado in ('confirmada', 'cancelada')),
  creado timestamptz not null default now(),
  constraint clase_o_taller check ((taller_id is null) <> (horario_id is null and fecha is null))
);
create unique index if not exists una_reserva_por_clase on public.reservas (user_id, horario_id, fecha)
  where estado = 'confirmada' and horario_id is not null;
create unique index if not exists una_reserva_por_taller on public.reservas (user_id, taller_id)
  where estado = 'confirmada' and taller_id is not null;
create index if not exists reservas_por_clase on public.reservas (horario_id, fecha) where estado = 'confirmada';

-- Reglas: horarios, cierres y talleres los ve todo el mundo y solo los cambia el taller;
-- bonos y reservas los ve cada persona (los suyos) y el taller, y se crean solo por las funciones
alter table public.horarios enable row level security;
alter table public.cierres enable row level security;
alter table public.talleres enable row level security;
alter table public.bonos enable row level security;
alter table public.reservas enable row level security;

drop policy if exists "Horarios: todos los ven" on public.horarios;
create policy "Horarios: todos los ven" on public.horarios for select to anon, authenticated using (true);
drop policy if exists "Horarios: el taller los cambia" on public.horarios;
create policy "Horarios: el taller los cambia" on public.horarios for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Cierres: todos los ven" on public.cierres;
create policy "Cierres: todos los ven" on public.cierres for select to anon, authenticated using (true);
drop policy if exists "Cierres: el taller los cambia" on public.cierres;
create policy "Cierres: el taller los cambia" on public.cierres for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Talleres: todos ven los publicados" on public.talleres;
create policy "Talleres: todos ven los publicados" on public.talleres for select to anon, authenticated using (publicado or public.es_admin());
drop policy if exists "Talleres: el taller los cambia" on public.talleres;
create policy "Talleres: el taller los cambia" on public.talleres for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Bonos: los tuyos" on public.bonos;
create policy "Bonos: los tuyos" on public.bonos for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists "Bonos: el taller los cambia" on public.bonos;
create policy "Bonos: el taller los cambia" on public.bonos for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "Bonos: el taller los borra" on public.bonos;
create policy "Bonos: el taller los borra" on public.bonos for delete to authenticated using (public.es_admin());

drop policy if exists "Reservas: las tuyas" on public.reservas;
create policy "Reservas: las tuyas" on public.reservas for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists "Reservas: el taller las cambia" on public.reservas;
create policy "Reservas: el taller las cambia" on public.reservas for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "Reservas: el taller las borra" on public.reservas;
create policy "Reservas: el taller las borra" on public.reservas for delete to authenticated using (public.es_admin());

-- Plazas ocupadas en una clase: los fijos del mes (pedidos o activos) y las reservas sueltas
create or replace function public.ocupadas(p_horario uuid, p_fecha date) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from bonos b
           where b.tipo = 'mensual' and b.horario_id = p_horario and b.estado in ('pendiente', 'activo')
             and b.mes = date_trunc('month', p_fecha)::date)::int
       + (select count(*) from reservas r
           where r.horario_id = p_horario and r.fecha = p_fecha and r.estado = 'confirmada')::int
$$;
create or replace function public.cerrado(p_horario uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cierres c where c.fecha = p_fecha and (c.horario_id is null or c.horario_id = p_horario))
$$;
revoke all on function public.ocupadas(uuid, date), public.cerrado(uuid, date) from public, anon, authenticated;

-- Las clases entre dos fechas con sus plazas libres (sin decir quién va)
create or replace function public.disponibilidad(p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = public as $$
  with dias as (
    select d::date as fecha
    from generate_series(greatest(p_desde, hoy_madrid()), least(p_hasta, greatest(p_desde, hoy_madrid()) + 62), interval '1 day') d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'horario', h.id, 'fecha', dias.fecha, 'hora', to_char(h.hora, 'HH24:MI'), 'duracion', h.duracion,
      'actividad', h.actividad, 'plazas', h.plazas,
      'libres', greatest(0, h.plazas - ocupadas(h.id, dias.fecha)),
      'cerrado', cerrado(h.id, dias.fecha),
      'empezada', dias.fecha + h.hora <= ahora_madrid() + interval '1 hour',
      'fija', auth.uid() is not null and exists (select 1 from bonos b where b.user_id = auth.uid() and b.tipo = 'mensual'
                and b.horario_id = h.id and b.mes = date_trunc('month', dias.fecha)::date and b.estado in ('pendiente', 'activo')),
      'reserva', (select r.id from reservas r where auth.uid() is not null and r.user_id = auth.uid() and r.horario_id = h.id
                    and r.fecha = dias.fecha and r.estado = 'confirmada' limit 1)
    ) order by dias.fecha, h.hora), '[]'::jsonb)
  from dias join horarios h on h.activo and h.dia = extract(isodow from dias.fecha)::int
$$;

create or replace function public.talleres_proximos() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'titulo', t.titulo, 'descripcion', t.descripcion, 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'),
      'duracion', t.duracion, 'plazas', t.plazas, 'precio', t.precio,
      'libres', greatest(0, t.plazas - (select count(*) from reservas r where r.taller_id = t.id and r.estado = 'confirmada')::int),
      'reserva', (select r.id from reservas r where auth.uid() is not null and r.taller_id = t.id and r.user_id = auth.uid()
                    and r.estado = 'confirmada' limit 1)
    ) order by t.fecha, t.hora), '[]'::jsonb)
  from talleres t where t.publicado and t.fecha + t.hora > ahora_madrid()
$$;

-- Reservar una clase suelta con un bono
create or replace function public.reservar_clase(p_horario uuid, p_fecha date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h horarios;
  b bonos;
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta para reservar'; end if;
  select * into h from horarios where id = p_horario and activo for update; -- una reserva detrás de otra
  if not found then raise exception 'Ese horario ya no existe'; end if;
  if extract(isodow from p_fecha)::int <> h.dia then raise exception 'Ese día no hay clase en ese horario'; end if;
  if p_fecha + h.hora <= ahora_madrid() + interval '1 hour' then raise exception 'Esa clase ya ha empezado o está a punto de empezar'; end if;
  if p_fecha > hoy_madrid() + 14 then raise exception 'Las clases sueltas se reservan como mucho 14 días antes'; end if;
  if cerrado(p_horario, p_fecha) then raise exception 'Ese día el taller está cerrado'; end if;
  if exists (select 1 from bonos x where x.user_id = auth.uid() and x.tipo = 'mensual' and x.horario_id = p_horario
               and x.mes = date_trunc('month', p_fecha)::date and x.estado in ('pendiente', 'activo')) then
    raise exception 'Ya tienes tu puesto fijo en esa clase';
  end if;
  if exists (select 1 from reservas r where r.user_id = auth.uid() and r.horario_id = p_horario and r.fecha = p_fecha
               and r.estado = 'confirmada') then
    raise exception 'Ya tienes reservada esa clase';
  end if;
  if ocupadas(p_horario, p_fecha) >= h.plazas then raise exception 'Esa clase está completa'; end if;
  -- Primero el bono que caduca antes
  select x.* into b from bonos x
   where x.user_id = auth.uid() and x.estado = 'activo' and x.tipo in ('bono4', 'pack10')
     and (x.caduca is null or x.caduca >= p_fecha)
     and x.sesiones > (select count(*) from reservas r where r.bono_id = x.id and r.estado = 'confirmada')
   order by x.caduca nulls last, x.creado
   limit 1 for update;
  if not found then raise exception 'No te quedan sesiones en ningún bono activo para ese día'; end if;
  insert into reservas (user_id, bono_id, horario_id, fecha, nombre, telefono)
  values (auth.uid(), b.id, p_horario, p_fecha, b.nombre, b.telefono);
  return jsonb_build_object('ok', true,
    'restantes', b.sesiones - (select count(*) from reservas r where r.bono_id = b.id and r.estado = 'confirmada'));
end $$;

-- Apuntarse a un taller de un día (se paga en el taller)
create or replace function public.apuntarse_taller(p_taller uuid, p_nombre text, p_telefono text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t talleres;
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta para apuntarte'; end if;
  if coalesce(btrim(p_nombre), '') = '' or length(p_nombre) > 120 then raise exception 'Escribe tu nombre'; end if;
  if length(p_telefono) > 40 then raise exception 'Ese teléfono es demasiado largo'; end if;
  select * into t from talleres where id = p_taller and publicado for update;
  if not found then raise exception 'Ese taller ya no está disponible'; end if;
  if t.fecha + t.hora <= ahora_madrid() + interval '1 hour' then raise exception 'Ese taller ya ha empezado'; end if;
  if exists (select 1 from reservas r where r.user_id = auth.uid() and r.taller_id = p_taller and r.estado = 'confirmada') then
    raise exception 'Ya te has apuntado a este taller';
  end if;
  if (select count(*) from reservas r where r.taller_id = p_taller and r.estado = 'confirmada') >= t.plazas then
    raise exception 'Ese taller está completo';
  end if;
  insert into reservas (user_id, taller_id, nombre, telefono) values (auth.uid(), p_taller, btrim(p_nombre), nullif(btrim(p_telefono), ''));
  return jsonb_build_object('ok', true);
end $$;

-- Cancelar: clases hasta 24 h antes, talleres hasta 48 h antes (la sesión vuelve al bono)
create or replace function public.cancelar_reserva(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r reservas;
  inicio timestamp;
  margen interval;
begin
  select * into r from reservas where id = p_reserva and user_id = auth.uid() and estado = 'confirmada' for update;
  if not found then raise exception 'No encuentro esa reserva'; end if;
  if r.taller_id is not null then
    select t.fecha + t.hora into inicio from talleres t where t.id = r.taller_id;
    margen := interval '48 hours';
  else
    select r.fecha + h.hora into inicio from horarios h where h.id = r.horario_id;
    margen := interval '24 hours';
  end if;
  if inicio - ahora_madrid() < margen then
    raise exception 'Ya no se puede cancelar en la web (hasta % horas antes). Escribe al taller.', (extract(epoch from margen) / 3600)::int;
  end if;
  update reservas set estado = 'cancelada' where id = p_reserva;
  return jsonb_build_object('ok', true);
end $$;

-- Pedir un bono o una mensualidad fija: queda pendiente hasta que el taller la cobra y la activa
create or replace function public.pedir_bono(p_tipo text, p_nombre text, p_telefono text,
                                             p_horario uuid default null, p_mes date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h horarios;
  v_mes date;
  este_mes date := date_trunc('month', hoy_madrid())::date;
  v_sesiones int;
  nuevo uuid;
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta para pedirlo'; end if;
  if p_tipo not in ('mensual', 'bono4', 'pack10') then raise exception 'Ese tipo de bono no existe'; end if;
  if coalesce(btrim(p_nombre), '') = '' or length(p_nombre) > 120 then raise exception 'Escribe tu nombre'; end if;
  if length(p_telefono) > 40 then raise exception 'Ese teléfono es demasiado largo'; end if;
  if (select count(*) from bonos where user_id = auth.uid() and estado = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 peticiones pendientes: espera a que el taller las confirme';
  end if;

  if p_tipo = 'mensual' then
    select * into h from horarios where id = p_horario and activo for update;
    if not found then raise exception 'Elige un horario'; end if;
    v_mes := date_trunc('month', coalesce(p_mes, hoy_madrid()))::date;
    if v_mes < este_mes or v_mes > (este_mes + interval '1 month')::date then
      raise exception 'Solo se puede pedir este mes o el siguiente';
    end if;
    if exists (select 1 from bonos b where b.user_id = auth.uid() and b.tipo = 'mensual' and b.horario_id = p_horario
                 and b.mes = v_mes and b.estado <> 'cancelado') then
      raise exception 'Ya tienes pedida esa mensualidad';
    end if;
    -- Preferencia: hasta el día 24, el mes siguiente es para quien ya tiene ese horario fijo
    if v_mes > este_mes and extract(day from hoy_madrid()) < 25
       and not exists (select 1 from bonos b where b.user_id = auth.uid() and b.tipo = 'mensual' and b.horario_id = p_horario
                         and b.mes = este_mes and b.estado = 'activo') then
      raise exception 'Hasta el día 25, el mes que viene está guardado para quien ya tiene este horario fijo. Pídelo a partir del 25.';
    end if;
    -- Clases que quedan ese mes en ese horario (sin días cerrados)
    select count(*) into v_sesiones
      from generate_series(greatest(v_mes, hoy_madrid()), (v_mes + interval '1 month - 1 day')::date, interval '1 day') d
     where extract(isodow from d)::int = h.dia and not cerrado(h.id, d::date) and d::date + h.hora > ahora_madrid() + interval '1 hour';
    if v_sesiones = 0 then raise exception 'Ya no quedan clases ese mes en ese horario'; end if;
    if exists (select 1 from generate_series(greatest(v_mes, hoy_madrid()), (v_mes + interval '1 month - 1 day')::date, interval '1 day') d
                where extract(isodow from d)::int = h.dia and not cerrado(h.id, d::date) and ocupadas(h.id, d::date) >= h.plazas) then
      raise exception 'Ese horario no tiene sitio fijo libre ese mes';
    end if;
    insert into bonos (user_id, tipo, sesiones, horario_id, mes, caduca, nombre, telefono)
    values (auth.uid(), 'mensual', v_sesiones, p_horario, v_mes, (v_mes + interval '1 month - 1 day')::date,
            btrim(p_nombre), nullif(btrim(p_telefono), ''))
    returning id into nuevo;
  else
    insert into bonos (user_id, tipo, sesiones, nombre, telefono)
    values (auth.uid(), p_tipo, case p_tipo when 'bono4' then 4 else 10 end, btrim(p_nombre), nullif(btrim(p_telefono), ''))
    returning id into nuevo;
  end if;
  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

-- Lo tuyo: bonos con las sesiones que quedan y próximas reservas
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bonos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', b.id, 'tipo', b.tipo, 'estado', b.estado, 'sesiones', b.sesiones,
          'usadas', (select count(*) from reservas r where r.bono_id = b.id and r.estado = 'confirmada'),
          'caduca', b.caduca, 'mes', b.mes, 'dia', h.dia, 'hora', to_char(h.hora, 'HH24:MI'), 'actividad', h.actividad
        ) order by b.creado desc)
      from bonos b left join horarios h on h.id = b.horario_id
      where b.user_id = auth.uid() and b.estado <> 'cancelado' and (b.caduca is null or b.caduca >= hoy_madrid())), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(x.datos order by x.inicio) from (
        select r.fecha + h.hora as inicio, jsonb_build_object('id', r.id, 'tipo', 'clase', 'fecha', r.fecha,
                 'hora', to_char(h.hora, 'HH24:MI'), 'nombre', h.actividad) as datos
          from reservas r join horarios h on h.id = r.horario_id
         where r.user_id = auth.uid() and r.estado = 'confirmada' and r.fecha + h.hora > ahora_madrid()
        union all
        select t.fecha + t.hora, jsonb_build_object('id', r.id, 'tipo', 'taller', 'fecha', t.fecha,
                 'hora', to_char(t.hora, 'HH24:MI'), 'nombre', t.titulo)
          from reservas r join talleres t on t.id = r.taller_id
         where r.user_id = auth.uid() and r.estado = 'confirmada' and t.fecha + t.hora > ahora_madrid()
      ) x), '[]'::jsonb),
    'nombre', (select x.nombre from (select nombre, creado from bonos where user_id = auth.uid()
                                     union all select nombre, creado from reservas where user_id = auth.uid() and nombre is not null) x
               order by x.creado desc limit 1),
    'telefono', (select x.telefono from (select telefono, creado from bonos where user_id = auth.uid()
                                         union all select telefono, creado from reservas where user_id = auth.uid()) x
                 where x.telefono is not null order by x.creado desc limit 1)
  )
  where auth.uid() is not null
$$;

-- ---------- Para el taller ----------

create or replace function public.activar_bono(p_bono uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el taller puede activar bonos'; end if;
  update bonos set estado = 'activo', activado = now(),
         caduca = case tipo when 'bono4' then (hoy_madrid() + interval '2 months')::date
                            when 'pack10' then (hoy_madrid() + interval '4 months')::date
                            else caduca end
   where id = p_bono and estado = 'pendiente';
  if not found then raise exception 'Ese bono no está pendiente'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Cancelar un bono libera sus reservas futuras
create or replace function public.cancelar_bono(p_bono uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el taller puede cancelar bonos'; end if;
  update bonos set estado = 'cancelado' where id = p_bono and estado <> 'cancelado';
  if not found then raise exception 'Ese bono ya estaba cancelado'; end if;
  update reservas r set estado = 'cancelada'
    from horarios h
   where r.bono_id = p_bono and r.estado = 'confirmada' and h.id = r.horario_id and r.fecha + h.hora > ahora_madrid();
  return jsonb_build_object('ok', true);
end $$;

-- Quién viene a cada clase y a cada taller entre dos fechas
create or replace function public.agenda_admin(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo para el taller'; end if;
  return jsonb_build_object(
    'clases', coalesce((
      select jsonb_agg(jsonb_build_object(
          'horario', h.id, 'fecha', d::date, 'hora', to_char(h.hora, 'HH24:MI'), 'duracion', h.duracion,
          'actividad', h.actividad, 'plazas', h.plazas, 'cerrado', cerrado(h.id, d::date),
          'fijos', coalesce((select jsonb_agg(jsonb_build_object('nombre', b.nombre, 'telefono', b.telefono, 'estado', b.estado) order by b.nombre)
                               from bonos b where b.tipo = 'mensual' and b.horario_id = h.id and b.mes = date_trunc('month', d)::date
                                and b.estado in ('pendiente', 'activo')), '[]'::jsonb),
          'sueltos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'telefono', r.telefono) order by r.creado)
                                 from reservas r where r.horario_id = h.id and r.fecha = d::date and r.estado = 'confirmada'), '[]'::jsonb)
        ) order by d, h.hora)
      from generate_series(p_desde, least(p_hasta, p_desde + 62), interval '1 day') d
      join horarios h on h.activo and h.dia = extract(isodow from d)::int), '[]'::jsonb),
    'talleres', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', t.id, 'titulo', t.titulo, 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'), 'plazas', t.plazas,
          'precio', t.precio, 'publicado', t.publicado,
          'apuntados', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'telefono', r.telefono) order by r.creado)
                                   from reservas r where r.taller_id = t.id and r.estado = 'confirmada'), '[]'::jsonb)
        ) order by t.fecha, t.hora)
      from talleres t where t.fecha between p_desde and least(p_hasta, p_desde + 62)), '[]'::jsonb));
end $$;

-- Bonos de todo el mundo, con su correo y lo que les queda
create or replace function public.alumnos_admin() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo para el taller'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'tipo', b.tipo, 'estado', b.estado, 'nombre', b.nombre, 'telefono', b.telefono, 'correo', u.email,
        'sesiones', b.sesiones, 'usadas', (select count(*) from reservas r where r.bono_id = b.id and r.estado = 'confirmada'),
        'caduca', b.caduca, 'mes', b.mes, 'dia', h.dia, 'hora', to_char(h.hora, 'HH24:MI'), 'creado', b.creado
      ) order by (b.estado = 'pendiente') desc, b.creado desc)
    from bonos b left join auth.users u on u.id = b.user_id left join horarios h on h.id = b.horario_id
    where b.estado <> 'cancelado' and (b.caduca is null or b.caduca >= hoy_madrid() - 31)), '[]'::jsonb);
end $$;

-- ============================================================
-- Horneados: presupuestos que la gente envía desde la página del horno
-- ============================================================
-- Como los encargos: cualquiera puede enviar uno; solo el taller lo ve y lo cambia.

create table if not exists public.horneados (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  nombre text not null check (length(nombre) between 1 and 120),
  correo text check (length(correo) <= 200),
  telefono text check (length(telefono) <= 40),
  contestar_por text not null default 'whatsapp' check (contestar_por in ('correo', 'whatsapp')),
  -- [{ "descripcion": "2 piezas de 10 × 9 ⌀ cm · esmaltado · alta temperatura", "total": 6.8 }, …]
  piezas jsonb not null check (jsonb_typeof(piezas) = 'array' and jsonb_array_length(piezas) between 1 and 50
                               and pg_column_size(piezas) < 20000),
  total numeric(8, 2) check (total >= 0 and total < 100000),
  cuando text check (length(cuando) <= 120),  -- cuándo puede traer las piezas
  notas text check (length(notas) <= 2000),
  -- lo rellenas tú
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'aceptado', 'en-horno', 'listo', 'recogido', 'descartado')),
  precio_final numeric(8, 2),
  notas_taller text,
  constraint horneado_con_contacto check (coalesce(correo, '') <> '' or coalesce(telefono, '') <> '')
);
create index if not exists horneados_por_fecha on public.horneados (creado desc);
alter table public.horneados enable row level security;

drop policy if exists "Cualquiera puede enviar un horneado" on public.horneados;
create policy "Cualquiera puede enviar un horneado" on public.horneados for insert to anon, authenticated
  with check (estado = 'nuevo' and precio_final is null and notas_taller is null
              and (user_id is null or user_id = auth.uid()));
drop policy if exists "El taller ve los horneados" on public.horneados;
create policy "El taller ve los horneados" on public.horneados for select to authenticated using (public.es_admin());
drop policy if exists "El taller cambia los horneados" on public.horneados;
create policy "El taller cambia los horneados" on public.horneados for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists "El taller borra los horneados" on public.horneados;
create policy "El taller borra los horneados" on public.horneados for delete to authenticated using (public.es_admin());

-- Aviso por correo, con la misma clave de Resend que los encargos
create or replace function public.avisar_horneado() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  clave text;
  destinatarios text[];
  limpio text := regexp_replace(coalesce(new.nombre, ''), '\s+', ' ', 'g');
  lineas text;
begin
  select decrypted_secret into clave from vault.decrypted_secrets where name = 'resend_api_key';
  select array_agg(correo) into destinatarios from public.admins;
  if clave is null or destinatarios is null then
    return new;
  end if;
  select string_agg('· ' || left(coalesce(p ->> 'descripcion', ''), 200) || coalesce(': ' || (p ->> 'total') || ' €', ''), E'\n')
    into lineas from jsonb_array_elements(new.piezas) p;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave, 'Content-Type', 'application/json'),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', 'El Almacén <onboarding@resend.dev>',
      'to', to_jsonb(destinatarios),
      'reply_to', nullif(new.correo, ''),
      'subject', left('Nuevo horneado de ' || limpio || coalesce(' · ' || new.total || ' €', ''), 150),
      'text', concat_ws(E'\n',
        'Te han enviado un presupuesto de horneado.', '',
        lineas,
        'Total orientativo: ' || new.total || ' €', '',
        'De: ' || limpio,
        'Teléfono: ' || new.telefono,
        'Correo: ' || new.correo,
        'Prefiere que le contestes por ' || case new.contestar_por when 'whatsapp' then 'WhatsApp' else 'correo' end,
        'Puede traerlas: ' || new.cuando,
        case when coalesce(new.notas, '') <> '' then E'\n' || left(new.notas, 1500) end,
        '', 'Míralo en tu panel:', 'https://webelalmacen.vercel.app/panel.html')
    ))
  );
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.avisar_horneado() from public, anon, authenticated;
drop trigger if exists avisar_horneado on public.horneados;
create trigger avisar_horneado after insert on public.horneados
  for each row execute function public.avisar_horneado();

-- Cuántas cosas esperan en el panel del taller (solo para el taller)
create or replace function public.resumen_panel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo para el taller'; end if;
  return jsonb_build_object(
    'encargos', (select count(*) from encargos where estado = 'nuevo'),
    'horneados', (select count(*) from horneados where estado = 'nuevo'),
    'bonos', (select count(*) from bonos where estado = 'pendiente'),
    'clases_hoy', (select count(*) from horarios h where h.activo and h.dia = extract(isodow from hoy_madrid())::int
                     and not cerrado(h.id, hoy_madrid())));
end $$;
