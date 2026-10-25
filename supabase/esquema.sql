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
--   · Mensualidad fija: un horario fijo con el puesto guardado. Se renueva sola
--     cada mes hasta que la persona la pausa (un mes suelto) o la deja. Los cambios
--     para el mes que viene se hacen hasta el día 24; desde el 25 ya cuentan para el otro.
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

-- Mensualidad continua: «mes» es el primer mes, «hasta» el último (vacío: sigue)
-- y «pausas» los meses que la persona no viene (ese mes su puesto queda libre)
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bonos' and column_name = 'hasta') then
    alter table public.bonos add column hasta date;
    update public.bonos set hasta = mes where tipo = 'mensual'; -- las de antes eran de un solo mes
  end if;
end $$;
alter table public.bonos add column if not exists pausas date[] not null default '{}';

-- ¿Esta mensualidad tiene puesto en la clase de ese día?
create or replace function public.mensual_cubre(b public.bonos, p_fecha date) returns boolean
language sql stable as $$
  select b.tipo = 'mensual' and b.mes is not null
     and date_trunc('month', p_fecha)::date >= b.mes
     and (b.hasta is null or date_trunc('month', p_fecha)::date <= b.hasta)
     and not (date_trunc('month', p_fecha)::date = any (b.pausas))
     and (b.estado = 'activo'
          -- pedida y sin pagar: guarda el puesto su primer mes y el siguiente, no para siempre
          or (b.estado = 'pendiente' and date_trunc('month', p_fecha)::date <= (b.mes + interval '1 month')::date))
$$;

-- Primer mes que aún se puede pausar o dejar: hasta el día 24, el que viene; desde el 25, el siguiente
create or replace function public.primer_mes_cambiable() returns date
language sql stable as $$
  select (date_trunc('month', hoy_madrid())
          + case when extract(day from hoy_madrid()) < 25 then interval '1 month' else interval '2 months' end)::date
$$;

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
  select (select count(*) from bonos b where b.horario_id = p_horario and mensual_cubre(b, p_fecha))::int
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
      'fija', auth.uid() is not null and exists (select 1 from bonos b where b.user_id = auth.uid() and b.horario_id = h.id
                and mensual_cubre(b, dias.fecha)),
      'pausa', auth.uid() is not null and exists (select 1 from bonos b where b.user_id = auth.uid() and b.horario_id = h.id
                and b.tipo = 'mensual' and b.estado in ('pendiente', 'activo')
                and date_trunc('month', dias.fecha)::date = any (b.pausas)),
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
  if exists (select 1 from bonos x where x.user_id = auth.uid() and x.horario_id = p_horario and mensual_cubre(x, p_fecha)) then
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
                 and b.estado <> 'cancelado' and (b.hasta is null or b.hasta >= v_mes)) then
      raise exception 'Ya tienes una mensualidad en ese horario';
    end if;
    -- Clases que quedan el primer mes en ese horario (sin días cerrados)
    select count(*) into v_sesiones
      from generate_series(greatest(v_mes, hoy_madrid()), (v_mes + interval '1 month - 1 day')::date, interval '1 day') d
     where extract(isodow from d)::int = h.dia and not cerrado(h.id, d::date) and d::date + h.hora > ahora_madrid() + interval '1 hour';
    if v_sesiones = 0 then raise exception 'Ya no quedan clases ese mes en ese horario'; end if;
    -- Hace falta sitio fijo ese mes y el siguiente: quien ya está renueva sola y no se le quita el puesto
    if exists (select 1 from generate_series(greatest(v_mes, hoy_madrid()), (v_mes + interval '2 months - 1 day')::date, interval '1 day') d
                where extract(isodow from d)::int = h.dia and not cerrado(h.id, d::date)
                  and (select count(*) from bonos b where b.horario_id = h.id and mensual_cubre(b, d::date)) >= h.plazas) then
      raise exception 'Ese horario no tiene sitio fijo libre. Mira otro horario o reserva clases sueltas con un bono.';
    end if;
    insert into bonos (user_id, tipo, sesiones, horario_id, mes, nombre, telefono)
    values (auth.uid(), 'mensual', v_sesiones, p_horario, v_mes, btrim(p_nombre), nullif(btrim(p_telefono), ''))
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
          'caduca', b.caduca, 'mes', b.mes, 'hasta', b.hasta, 'pausas', to_jsonb(b.pausas),
          'dia', h.dia, 'hora', to_char(h.hora, 'HH24:MI'), 'actividad', h.actividad
        ) order by b.creado desc)
      from bonos b left join horarios h on h.id = b.horario_id
      where b.user_id = auth.uid() and b.estado <> 'cancelado'
        and case when b.tipo = 'mensual' then b.hasta is null or b.hasta >= date_trunc('month', hoy_madrid())::date
                 else b.caduca is null or b.caduca >= hoy_madrid() end), '[]'::jsonb),
    'cambiable', primer_mes_cambiable(),
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

-- Tu calendario: lo tuyo entre dos fechas (como mucho 7 meses de golpe)
--   · fija: la clase de tu mensualidad cada semana (menos meses en pausa)
--   · suelta: una clase reservada con un bono
--   · taller: un taller de un día al que te has apuntado
create or replace function public.mi_calendario(p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.e order by x.fecha, x.hora), '[]'::jsonb) from (
    select d::date as fecha, to_char(h.hora, 'HH24:MI') as hora,
           jsonb_build_object('tipo', 'fija', 'fecha', d::date, 'hora', to_char(h.hora, 'HH24:MI'), 'duracion', h.duracion,
                              'titulo', h.actividad, 'cerrado', cerrado(h.id, d::date), 'pendiente', b.estado = 'pendiente') as e
      from bonos b
      join horarios h on h.id = b.horario_id
      cross join lateral generate_series(p_desde::timestamp, least(p_hasta, p_desde + 215)::timestamp, interval '1 day') d
     where auth.uid() is not null and b.user_id = auth.uid() and b.tipo = 'mensual'
       and extract(isodow from d)::int = h.dia and mensual_cubre(b, d::date)
    union all
    select r.fecha, to_char(h.hora, 'HH24:MI'),
           jsonb_build_object('tipo', 'suelta', 'id', r.id, 'fecha', r.fecha, 'hora', to_char(h.hora, 'HH24:MI'),
                              'duracion', h.duracion, 'titulo', h.actividad,
                              'cancelable', r.fecha + h.hora - ahora_madrid() >= interval '24 hours')
      from reservas r join horarios h on h.id = r.horario_id
     where auth.uid() is not null and r.user_id = auth.uid() and r.estado = 'confirmada'
       and r.fecha between p_desde and least(p_hasta, p_desde + 215)
    union all
    select t.fecha, to_char(t.hora, 'HH24:MI'),
           jsonb_build_object('tipo', 'taller', 'id', r.id, 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'),
                              'duracion', t.duracion, 'titulo', t.titulo,
                              'cancelable', t.fecha + t.hora - ahora_madrid() >= interval '48 hours')
      from reservas r join talleres t on t.id = r.taller_id
     where auth.uid() is not null and r.user_id = auth.uid() and r.estado = 'confirmada'
       and t.fecha between p_desde and least(p_hasta, p_desde + 215)
  ) x
$$;
revoke execute on function public.mi_calendario(date, date) from public, anon;
grant execute on function public.mi_calendario(date, date) to authenticated;

-- Pausar un mes de la mensualidad (o quitar la pausa). Ese mes el puesto queda libre.
create or replace function public.pausar_mes(p_bono uuid, p_mes date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bonos;
  v_mes date := date_trunc('month', p_mes)::date;
begin
  select * into b from bonos where id = p_bono and user_id = auth.uid() and tipo = 'mensual' and estado <> 'cancelado' for update;
  if not found then raise exception 'No encuentro esa mensualidad'; end if;
  if v_mes < primer_mes_cambiable() then
    raise exception 'Ese mes ya no se puede cambiar en la web: los cambios del mes siguiente se hacen hasta el día 24. Escribe al taller.';
  end if;
  if v_mes > (primer_mes_cambiable() + interval '3 months')::date then raise exception 'Se puede pausar como mucho con 4 meses de antelación'; end if;
  if v_mes < b.mes or (b.hasta is not null and v_mes > b.hasta) then raise exception 'Ese mes no entra en tu mensualidad'; end if;
  if v_mes = any (b.pausas) then
    -- Quitar la pausa: solo si su puesto sigue libre ese mes
    if exists (select 1 from horarios h, generate_series(v_mes, (v_mes + interval '1 month - 1 day')::date, interval '1 day') d
                where h.id = b.horario_id and extract(isodow from d)::int = h.dia and not cerrado(h.id, d::date)
                  and ocupadas(h.id, d::date) >= h.plazas) then
      raise exception 'Mientras estaba en pausa alguien ha cogido el sitio ese mes. Escribe al taller.';
    end if;
    update bonos set pausas = array_remove(pausas, v_mes) where id = p_bono;
    return jsonb_build_object('ok', true, 'pausado', false);
  end if;
  if cardinality(array(select x from unnest(b.pausas) x where x >= date_trunc('month', hoy_madrid())::date)) >= 2 then
    raise exception 'Como mucho puedes tener 2 meses en pausa. Si vas a faltar más, deja la mensualidad y vuelve a pedirla.';
  end if;
  update bonos set pausas = array_append(pausas, v_mes) where id = p_bono;
  return jsonb_build_object('ok', true, 'pausado', true);
end $$;

-- Dejar la mensualidad: sigue hasta el último mes que ya no se puede cambiar
create or replace function public.dejar_mensualidad(p_bono uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bonos;
  v_hasta date := (primer_mes_cambiable() - interval '1 month')::date;
begin
  select * into b from bonos where id = p_bono and user_id = auth.uid() and tipo = 'mensual' and estado <> 'cancelado' for update;
  if not found then raise exception 'No encuentro esa mensualidad'; end if;
  if b.hasta is not null and b.hasta <= v_hasta then raise exception 'Esta mensualidad ya termina'; end if;
  if b.mes > v_hasta then
    update bonos set estado = 'cancelado', hasta = b.mes where id = p_bono; -- aún no había empezado
    return jsonb_build_object('ok', true, 'hasta', null);
  end if;
  update bonos set hasta = v_hasta, pausas = array(select x from unnest(pausas) x where x <= v_hasta) where id = p_bono;
  return jsonb_build_object('ok', true, 'hasta', v_hasta);
end $$;

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
                               from bonos b where b.horario_id = h.id and mensual_cubre(b, d::date)), '[]'::jsonb),
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
        'caduca', b.caduca, 'mes', b.mes, 'hasta', b.hasta, 'pausas', to_jsonb(b.pausas),
        'dia', h.dia, 'hora', to_char(h.hora, 'HH24:MI'), 'creado', b.creado
      ) order by (b.estado = 'pendiente') desc, b.creado desc)
    from bonos b left join auth.users u on u.id = b.user_id left join horarios h on h.id = b.horario_id
    where b.estado <> 'cancelado'
      and case when b.tipo = 'mensual' then b.hasta is null or b.hasta >= date_trunc('month', hoy_madrid() - 31)::date
               else b.caduca is null or b.caduca >= hoy_madrid() - 31 end), '[]'::jsonb);
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
-- Qué día y a qué hora le gustaría recoger las piezas (lo confirma el taller)
alter table public.horneados add column if not exists recoger date;
alter table public.horneados add column if not exists recoger_horario text check (length(recoger_horario) <= 40);
-- Cuándo le avisó el taller de que ya podía pasar a recogerlas
alter table public.horneados add column if not exists avisado timestamptz;
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
        'Le gustaría recogerlas: ' || nullif(concat_ws(', ', to_char(new.recoger, 'DD/MM/YYYY'), lower(new.recoger_horario)), ''),
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
    'avisos', (select count(distinct publicacion_id) from avisos),
    'clases_hoy', (select count(*) from horarios h where h.activo and h.dia = extract(isodow from hoy_madrid())::int
                     and not cerrado(h.id, hoy_madrid())));
end $$;

-- ============================================================
-- Comunidad: un foro para compartir esmaltes, recetas, piezas y problemas
-- ============================================================
-- Solo para cuentas: para leer, publicar, comentar o votar hay que haber entrado
-- (el modo invitado no vale). Para publicar y comentar hace falta además un nombre
-- público (nunca se enseña el correo). Cada cual cambia y borra lo suyo; el taller
-- puede borrar cualquier cosa.

create table if not exists public.perfiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  alias text check (length(btrim(alias)) between 2 and 40),
  creado timestamptz not null default now()
);
-- El nombre público solo hace falta para publicar: el perfil también guarda la
-- foto (en el cubo «comunidad», dentro de tu carpeta) y si enseñas tus insignias
alter table public.perfiles alter column alias drop not null;
alter table public.perfiles add column if not exists foto text
  check (foto is null or (length(foto) < 200 and foto like user_id::text || '/%'));
alter table public.perfiles add column if not exists insignias text not null default 'privadas'
  check (insignias in ('privadas', 'publicas', 'ocultas'));

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  categoria text not null check (categoria in ('esmaltes', 'recetas', 'problemas', 'piezas', 'charla', 'inspiracion')),
  titulo text not null check (length(btrim(titulo)) between 3 and 140),
  cuerpo text not null default '' check (length(cuerpo) <= 10000),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 6),
  adjunto jsonb check (adjunto is null or pg_column_size(adjunto) < 20000),
  solucion uuid,
  creado timestamptz not null default now(),
  editado timestamptz
);
create index if not exists publicaciones_por_fecha on public.publicaciones (creado desc);
create index if not exists publicaciones_por_categoria on public.publicaciones (categoria, creado desc);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 4000),
  creado timestamptz not null default now()
);
create index if not exists comentarios_por_publicacion on public.comentarios (publicacion_id, creado);

create table if not exists public.votos (
  publicacion_id uuid not null references public.publicaciones on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  creado timestamptz not null default now(),
  primary key (publicacion_id, user_id)
);

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones on delete cascade,
  comentario_id uuid references public.comentarios on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  motivo text check (length(motivo) <= 500),
  creado timestamptz not null default now()
);

-- La fecha de edición la pone el servidor
create or replace function public.marcar_editado() returns trigger
language plpgsql as $$ begin new.editado := now(); return new; end $$;
drop trigger if exists marcar_editado on public.publicaciones;
create trigger marcar_editado before update of titulo, cuerpo on public.publicaciones
  for each row execute function public.marcar_editado();

-- Qué columnas puede escribir cada cual (el resto, solo las funciones de abajo)
revoke insert, update on public.perfiles, public.publicaciones, public.comentarios, public.votos, public.avisos from anon, authenticated;
grant insert (alias, foto, insignias), update (alias, foto, insignias) on public.perfiles to authenticated;
grant insert (categoria, titulo, cuerpo, fotos, adjunto), update (titulo, cuerpo) on public.publicaciones to authenticated;
grant insert (publicacion_id, cuerpo), update (cuerpo) on public.comentarios to authenticated;
grant insert (publicacion_id, comentario_id, motivo) on public.avisos to authenticated;

alter table public.perfiles enable row level security;
alter table public.publicaciones enable row level security;
alter table public.comentarios enable row level security;
alter table public.votos enable row level security;
alter table public.avisos enable row level security;

drop policy if exists "Perfiles: todos los ven" on public.perfiles;
drop policy if exists "Perfiles: los ven las cuentas" on public.perfiles;
create policy "Perfiles: los ven las cuentas" on public.perfiles for select to authenticated using (true);
drop policy if exists "Perfiles: el tuyo" on public.perfiles;
create policy "Perfiles: el tuyo" on public.perfiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Perfiles: cambiar el tuyo" on public.perfiles;
create policy "Perfiles: cambiar el tuyo" on public.perfiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Publicaciones: todos las ven" on public.publicaciones;
drop policy if exists "Publicaciones: las ven las cuentas" on public.publicaciones;
create policy "Publicaciones: las ven las cuentas" on public.publicaciones for select to authenticated using (true);
drop policy if exists "Publicaciones: publicar" on public.publicaciones;
create policy "Publicaciones: publicar" on public.publicaciones for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.perfiles where user_id = auth.uid() and alias is not null)
              and (select count(*) from public.publicaciones x where x.user_id = auth.uid() and x.creado > now() - interval '1 day') < 20);
drop policy if exists "Publicaciones: cambiar las tuyas" on public.publicaciones;
create policy "Publicaciones: cambiar las tuyas" on public.publicaciones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Publicaciones: borrar" on public.publicaciones;
create policy "Publicaciones: borrar" on public.publicaciones for delete to authenticated using (user_id = auth.uid() or public.es_admin());

drop policy if exists "Comentarios: todos los ven" on public.comentarios;
drop policy if exists "Comentarios: los ven las cuentas" on public.comentarios;
create policy "Comentarios: los ven las cuentas" on public.comentarios for select to authenticated using (true);
drop policy if exists "Comentarios: comentar" on public.comentarios;
create policy "Comentarios: comentar" on public.comentarios for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.perfiles where user_id = auth.uid() and alias is not null)
              and (select count(*) from public.comentarios x where x.user_id = auth.uid() and x.creado > now() - interval '1 day') < 200);
drop policy if exists "Comentarios: cambiar los tuyos" on public.comentarios;
create policy "Comentarios: cambiar los tuyos" on public.comentarios for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Comentarios: borrar" on public.comentarios;
create policy "Comentarios: borrar" on public.comentarios for delete to authenticated using (user_id = auth.uid() or public.es_admin());

drop policy if exists "Votos: todos los ven" on public.votos;
drop policy if exists "Votos: los ven las cuentas" on public.votos;
create policy "Votos: los ven las cuentas" on public.votos for select to authenticated using (true);

drop policy if exists "Avisos: avisar" on public.avisos;
create policy "Avisos: avisar" on public.avisos for insert to authenticated
  with check (user_id = auth.uid()
              and (select count(*) from public.avisos x where x.user_id = auth.uid() and x.creado > now() - interval '1 day') < 20);
drop policy if exists "Avisos: el taller" on public.avisos;
create policy "Avisos: el taller" on public.avisos for select to authenticated using (public.es_admin());
drop policy if exists "Avisos: el taller los borra" on public.avisos;
create policy "Avisos: el taller los borra" on public.avisos for delete to authenticated using (public.es_admin());

-- Fotos de la comunidad: públicas para leer; cada cual sube en su carpeta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comunidad', 'comunidad', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Comunidad: subir fotos" on storage.objects;
create policy "Comunidad: subir fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'comunidad' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Comunidad: borrar fotos" on storage.objects;
create policy "Comunidad: borrar fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'comunidad' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- Portada del foro: publicaciones con autor, votos y comentarios
create or replace function public.comunidad_feed(p_categoria text default null, p_orden text default 'recientes',
                                                 p_buscar text default null, p_desde int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.datos order by x.peso desc, x.creado desc), '[]'::jsonb) from (
    select p.creado,
           case when p_orden = 'utiles' then (select count(*) from votos v where v.publicacion_id = p.id) else 0 end as peso,
           jsonb_build_object(
             'id', p.id, 'categoria', p.categoria, 'titulo', p.titulo, 'extracto', left(p.cuerpo, 200),
             'foto', p.fotos[1], 'fotos', cardinality(p.fotos), 'adjunto', p.adjunto ->> 'tipo',
             'autor', coalesce(pe.alias, 'Alguien'), 'autor_id', p.user_id, 'autor_foto', pe.foto, 'creado', p.creado, 'resuelto', p.solucion is not null,
             'votos', (select count(*) from votos v where v.publicacion_id = p.id),
             'comentarios', (select count(*) from comentarios c where c.publicacion_id = p.id),
             'mi_voto', auth.uid() is not null and exists (select 1 from votos v where v.publicacion_id = p.id and v.user_id = auth.uid()),
             'avisos', case when es_admin() then (select count(*) from avisos a where a.publicacion_id = p.id) end
           ) as datos
      from publicaciones p left join perfiles pe on pe.user_id = p.user_id
     where auth.uid() is not null
       and (p_categoria is null or p.categoria = p_categoria)
       and (coalesce(p_buscar, '') = '' or position(lower(p_buscar) in lower(p.titulo || ' ' || p.cuerpo)) > 0)
       and (p_orden <> 'avisos' or (es_admin() and exists (select 1 from avisos a where a.publicacion_id = p.id)))
     order by peso desc, p.creado desc
     offset greatest(p_desde, 0) limit 30
  ) x
$$;

-- Una publicación con sus comentarios
create or replace function public.comunidad_publicacion(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'categoria', p.categoria, 'titulo', p.titulo, 'cuerpo', p.cuerpo, 'fotos', to_jsonb(p.fotos),
    'adjunto', p.adjunto, 'solucion', p.solucion, 'creado', p.creado, 'editado', p.editado,
    'autor', coalesce(pe.alias, 'Alguien'), 'autor_id', p.user_id, 'autor_foto', pe.foto,
    'es_mia', coalesce(p.user_id = auth.uid(), false), 'puede_borrar', coalesce(p.user_id = auth.uid(), false) or es_admin(),
    'votos', (select count(*) from votos v where v.publicacion_id = p.id),
    'mi_voto', auth.uid() is not null and exists (select 1 from votos v where v.publicacion_id = p.id and v.user_id = auth.uid()),
    'avisos', case when es_admin() then coalesce((select jsonb_agg(jsonb_build_object('motivo', a.motivo, 'comentario', a.comentario_id, 'creado', a.creado))
                                                    from avisos a where a.publicacion_id = p.id), '[]'::jsonb) end,
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id, 'cuerpo', c.cuerpo, 'creado', c.creado, 'autor', coalesce(cp.alias, 'Alguien'), 'autor_id', c.user_id, 'autor_foto', cp.foto,
          'del_autor', c.user_id = p.user_id, 'es_mio', coalesce(c.user_id = auth.uid(), false),
          'puede_borrar', coalesce(c.user_id = auth.uid(), false) or es_admin()
        ) order by c.creado)
      from comentarios c left join perfiles cp on cp.user_id = c.user_id
      where c.publicacion_id = p.id), '[]'::jsonb)
  )
  from publicaciones p left join perfiles pe on pe.user_id = p.user_id
  where p.id = p_id and auth.uid() is not null
$$;
revoke execute on function public.comunidad_feed(text, text, text, int), public.comunidad_publicacion(uuid) from public, anon;
grant execute on function public.comunidad_feed(text, text, text, int), public.comunidad_publicacion(uuid) to authenticated;

-- «Útil»: se pone y se quita; en lo propio no
create or replace function public.votar(p_publicacion uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta para votar'; end if;
  if exists (select 1 from publicaciones where id = p_publicacion and user_id = auth.uid()) then
    raise exception 'Es tu propia publicación';
  end if;
  if not exists (select 1 from publicaciones where id = p_publicacion) then raise exception 'Esa publicación ya no existe'; end if;
  if exists (select 1 from votos where publicacion_id = p_publicacion and user_id = auth.uid()) then
    delete from votos where publicacion_id = p_publicacion and user_id = auth.uid();
  else
    insert into votos (publicacion_id, user_id) values (p_publicacion, auth.uid());
  end if;
  return jsonb_build_object(
    'votos', (select count(*) from votos where publicacion_id = p_publicacion),
    'mi_voto', exists (select 1 from votos where publicacion_id = p_publicacion and user_id = auth.uid()));
end $$;

-- Quien preguntó marca el comentario que le resolvió el problema (o lo desmarca con null)
create or replace function public.marcar_solucion(p_publicacion uuid, p_comentario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from publicaciones where id = p_publicacion and user_id = auth.uid()) then
    raise exception 'Solo quien publicó puede marcar la solución';
  end if;
  if p_comentario is not null and not exists (select 1 from comentarios where id = p_comentario and publicacion_id = p_publicacion) then
    raise exception 'Ese comentario no es de esta publicación';
  end if;
  update publicaciones set solucion = p_comentario where id = p_publicacion;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- Insignias: pequeños logros que se ganan solos al registrar cosas
-- ============================================================
-- Se calculan aquí, en el servidor, cada vez que se guarda una pieza, una
-- receta, una publicación o un comentario. Nunca se quitan (aunque borres la
-- pieza). Son privadas salvo que la persona elija enseñarlas en su perfil.

create table if not exists public.insignias (
  id text primary key,
  grupo text not null check (grupo in ('hitos', 'exploracion', 'comunidad', 'error')),
  nombre text not null,
  descripcion text not null,
  orden int not null
);
insert into public.insignias (id, grupo, nombre, descripcion, orden) values
  ('torno',       'hitos',       'Primera vuelta',     'Registra una pieza hecha en el torno.', 1),
  ('esmalte',     'hitos',       'Recién horneada',    'Registra una pieza esmaltada con una foto de cómo salió del horno.', 2),
  ('asa',         'hitos',       'Primer asa',         'Registra una pieza con asas.', 3),
  ('grande',      'hitos',       'Pieza grande',       'Registra una pieza de 25 cm o más de alto o de ancho.', 4),
  ('cinco',       'exploracion', 'Cinco esmaltes',     'Usa 5 esmaltes distintos entre todas tus piezas.', 5),
  ('pasta',       'exploracion', 'Otra pasta',         'Prueba una segunda pasta distinta.', 6),
  ('mezcla',      'exploracion', 'Mezcla',             'Pon dos esmaltes distintos en una misma pieza.', 7),
  ('receta',      'exploracion', 'Receta propia',      'Apunta una receta de esmalte con al menos dos materiales.', 8),
  ('probeta',     'comunidad',   'A la carta',         'Comparte en la comunidad un esmalte con la foto de su probeta cocida.', 9),
  ('consejo',     'comunidad',   'Buen consejo',       'Deja un comentario en la publicación de otra persona.', 10),
  ('solucion',    'comunidad',   'Problema resuelto',  'Tu comentario resuelve el problema de alguien.', 11),
  ('error',       'error',       'Aprender del error', 'Registra una pieza que salió mal y apunta qué pasó.', 12)
on conflict (id) do update set grupo = excluded.grupo, nombre = excluded.nombre,
  descripcion = excluded.descripcion, orden = excluded.orden;

create table if not exists public.insignias_ganadas (
  user_id uuid not null references auth.users on delete cascade,
  insignia_id text not null references public.insignias on delete cascade,
  ganada timestamptz not null default now(),
  vista boolean not null default false,
  primary key (user_id, insignia_id)
);

-- Las da solo el servidor; cada cual solo puede marcarlas como vistas
revoke insert, update, delete on public.insignias, public.insignias_ganadas from anon, authenticated;
grant select on public.insignias to anon, authenticated;
grant select on public.insignias_ganadas to authenticated;
revoke select on public.insignias_ganadas from anon;
grant update (vista) on public.insignias_ganadas to authenticated;
alter table public.insignias enable row level security;
alter table public.insignias_ganadas enable row level security;
drop policy if exists "Insignias: todos las ven" on public.insignias;
create policy "Insignias: todos las ven" on public.insignias for select to anon, authenticated using (true);
drop policy if exists "Ganadas: las tuyas y las que se enseñan" on public.insignias_ganadas;
create policy "Ganadas: las tuyas y las que se enseñan" on public.insignias_ganadas for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.perfiles p where p.user_id = insignias_ganadas.user_id and p.insignias = 'publicas'));
drop policy if exists "Ganadas: marcar como vistas" on public.insignias_ganadas;
create policy "Ganadas: marcar como vistas" on public.insignias_ganadas for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ayudas para leer lo que guarda la web sin que un dato raro rompa nada
create or replace function public.lista_json(j jsonb) returns jsonb
language sql immutable as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace function public.numero_json(t text) returns numeric
language sql immutable as $$ select case when btrim(t) ~ '^\d{1,6}([.,]\d+)?$' then replace(btrim(t), ',', '.')::numeric end $$;
-- Un nombre para cada esmalte de una capa: el mismo esmalte cuenta una vez
create or replace function public.esmalte_de_capa(c jsonb) returns text
language sql immutable as $$
  select case c ->> 'origen'
    when 'prodesco' then nullif('p:' || coalesce(c ->> 'codigo', ''), 'p:')
    when 'propio' then nullif('r:' || coalesce(c ->> 'receta', ''), 'r:')
    else nullif('o:' || lower(btrim(coalesce(c ->> 'nombre', ''))), 'o:') end
$$;

create or replace function public.revisar_insignias(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  with piezas as (
    select datos d from registros where user_id = p_user and almacen = 'piezas' and not borrado and jsonb_typeof(datos) = 'object'
  ), capas as (
    select d, esmalte_de_capa(c) esmalte from piezas, jsonb_array_elements(lista_json(d -> 'capas')) c
  ), logros(id, conseguido) as (values
    ('torno',   exists (select 1 from piezas where lista_json(d -> 'tecnicas') ? 'Torno')),
    ('esmalte', exists (select 1 from piezas where jsonb_array_length(lista_json(d -> 'capas')) > 0
                                               and jsonb_array_length(lista_json(d -> 'fotos')) > 0)),
    ('asa',     exists (select 1 from piezas where lista_json(d -> 'tecnicas') ? 'Asas')),
    ('grande',  exists (select 1 from piezas where greatest(numero_json(d ->> 'alto'), numero_json(d ->> 'ancho')) >= 25)),
    ('cinco',   (select count(distinct esmalte) from capas) >= 5),
    ('pasta',   (select count(distinct lower(btrim(d ->> 'pasta'))) from piezas where btrim(coalesce(d ->> 'pasta', '')) <> '') >= 2),
    ('mezcla',  exists (select 1 from capas group by d having count(distinct esmalte) >= 2)),
    ('receta',  exists (select 1 from registros r where r.user_id = p_user and r.almacen = 'recetas' and not r.borrado
                          and (select count(*) from jsonb_array_elements(lista_json(r.datos -> 'ingredientes')) i
                                where btrim(coalesce(i ->> 'material', '')) <> '' and numero_json(i ->> 'cantidad') > 0) >= 2)),
    ('probeta', exists (select 1 from publicaciones where user_id = p_user and categoria = 'esmaltes' and cardinality(fotos) > 0)),
    ('consejo', exists (select 1 from comentarios c join publicaciones p on p.id = c.publicacion_id
                         where c.user_id = p_user and p.user_id <> p_user)),
    ('solucion', exists (select 1 from publicaciones p join comentarios c on c.id = p.solucion
                          where c.user_id = p_user and p.user_id <> p_user)),
    ('error',   exists (select 1 from piezas where d ->> 'fallo' = 'true' and length(btrim(coalesce(d ->> 'que_paso', ''))) >= 10))
  )
  insert into insignias_ganadas (user_id, insignia_id)
  select p_user, id from logros where conseguido
  on conflict do nothing;
exception when others then
  -- Una insignia nunca debe impedir guardar una pieza
  raise warning 'revisar_insignias: %', sqlerrm;
end $$;
revoke execute on function public.revisar_insignias(uuid) from public, anon, authenticated;

-- Al guardar piezas o recetas (de una en una o muchas a la vez al sincronizar)
create or replace function public.insignias_por_registros() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform revisar_insignias(u.user_id) from (select distinct user_id from nuevos where almacen in ('piezas', 'recetas')) u;
  return null;
end $$;
drop trigger if exists insignias_al_crear on public.registros;
create trigger insignias_al_crear after insert on public.registros
  referencing new table as nuevos for each statement execute function public.insignias_por_registros();
drop trigger if exists insignias_al_cambiar on public.registros;
create trigger insignias_al_cambiar after update on public.registros
  referencing new table as nuevos for each statement execute function public.insignias_por_registros();

-- Al publicar, comentar o marcar una solución
create or replace function public.insignias_por_comunidad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'publicaciones' and tg_op = 'UPDATE' then
    perform revisar_insignias((select user_id from comentarios where id = new.solucion));
  else
    perform revisar_insignias(new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists insignias_al_publicar on public.publicaciones;
create trigger insignias_al_publicar after insert on public.publicaciones
  for each row execute function public.insignias_por_comunidad();
drop trigger if exists insignias_al_resolver on public.publicaciones;
create trigger insignias_al_resolver after update of solucion on public.publicaciones
  for each row when (new.solucion is not null) execute function public.insignias_por_comunidad();
drop trigger if exists insignias_al_comentar on public.comentarios;
create trigger insignias_al_comentar after insert on public.comentarios
  for each row execute function public.insignias_por_comunidad();

-- Lo que ya estaba guardado antes de existir las insignias también cuenta
do $$ begin perform public.revisar_insignias(id) from auth.users; end $$;

-- ============================================================
-- Tableros compartidos con enlace
-- ============================================================
-- Una copia del tablero (la composición aquí y las fotos en el cubo público
-- «tableros», dentro de la carpeta de quien lo comparte). El enlace lleva el id:
-- quien lo tenga puede verlo y guardárselo, también sin cuenta (como invitado).
-- Solo quien lo compartió lo cambia o lo borra.

create table if not exists public.tableros_compartidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tablero_id text not null check (length(tablero_id) <= 100),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  datos jsonb not null check (pg_column_size(datos) < 300000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (user_id, tablero_id)
);
drop trigger if exists tableros_compartidos_tocar on public.tableros_compartidos;
create trigger tableros_compartidos_tocar before update on public.tableros_compartidos
  for each row execute function public.registros_tocar();

revoke all on public.tableros_compartidos from anon;
grant select, insert, update, delete on public.tableros_compartidos to authenticated;
alter table public.tableros_compartidos enable row level security;
drop policy if exists "Compartidos: los tuyos" on public.tableros_compartidos;
create policy "Compartidos: los tuyos" on public.tableros_compartidos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Como mucho 100 tableros compartidos por persona
create or replace function public.limite_compartidos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from tableros_compartidos where user_id = new.user_id) >= 100 then
    raise exception 'Como mucho puedes tener 100 tableros compartidos';
  end if;
  return new;
end $$;
drop trigger if exists limite_compartidos on public.tableros_compartidos;
create trigger limite_compartidos before insert on public.tableros_compartidos
  for each row execute function public.limite_compartidos();

-- Abrir un enlace: el tablero y el nombre público de quien lo comparte (nunca el correo)
create or replace function public.tablero_compartido(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', t.nombre, 'datos', t.datos, 'autor', p.alias, 'actualizado', t.actualizado,
                            'mio', coalesce(t.user_id = auth.uid(), false))
    from tableros_compartidos t left join perfiles p on p.user_id = t.user_id
   where t.id = p_id
$$;
grant execute on function public.tablero_compartido(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tableros', 'tableros', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Tableros compartidos: subir fotos" on storage.objects;
create policy "Tableros compartidos: subir fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tableros' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Tableros compartidos: borrar fotos" on storage.objects;
create policy "Tableros compartidos: borrar fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'tableros' and (storage.foldername(name))[1] = auth.uid()::text);
-- Para borrar una foto, Supabase pide también poder verla: cada cual ve las de su carpeta
drop policy if exists "Tableros compartidos: ver las tuyas" on storage.objects;
create policy "Tableros compartidos: ver las tuyas" on storage.objects for select to authenticated
  using (bucket_id = 'tableros' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Comunidad: ver las tuyas" on storage.objects;
create policy "Comunidad: ver las tuyas" on storage.objects for select to authenticated
  using (bucket_id = 'comunidad' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- ============================================================
-- Inventario de esmaltes del taller
-- ============================================================
-- Lo que hay en el taller: los esmaltes de Prodesco (la clave es su enlace)
-- y los que no son de Prodesco (clave «propio:…», con su color). Si un esmalte
-- no está en la tabla, no hay. Lo ve todo el mundo (así en los tableros se sabe
-- si está en el taller); solo el taller lo cambia.

create table if not exists public.inventario_esmaltes (
  clave text primary key check (length(clave) between 3 and 300),
  codigo text check (length(codigo) <= 40),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  serie text check (length(serie) <= 120),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  miniatura text check (length(miniatura) <= 500),
  estado text not null default 'hay' check (estado in ('hay', 'poco')),
  nota text check (length(nota) <= 300),
  actualizado timestamptz not null default now()
);
drop trigger if exists inventario_tocar on public.inventario_esmaltes;
create trigger inventario_tocar before insert or update on public.inventario_esmaltes
  for each row execute function public.registros_tocar();

revoke insert, update, delete on public.inventario_esmaltes from anon;
grant select on public.inventario_esmaltes to anon, authenticated;
grant insert, update, delete on public.inventario_esmaltes to authenticated;
alter table public.inventario_esmaltes enable row level security;
drop policy if exists "Inventario: todos lo ven" on public.inventario_esmaltes;
create policy "Inventario: todos lo ven" on public.inventario_esmaltes for select to anon, authenticated using (true);
drop policy if exists "Inventario: el taller lo cambia" on public.inventario_esmaltes;
create policy "Inventario: el taller lo cambia" on public.inventario_esmaltes for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ============================================================
-- Tienda: las piezas a la venta
-- ============================================================
-- De momento es un escaparate: se ven las piezas con su precio y quien quiera
-- una la pide desde Encargos. Lo ve todo el mundo; solo el taller lo cambia.
-- Las fotos van en el bucket público «tienda».

create table if not exists public.tienda (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  descripcion text check (length(descripcion) <= 2000),
  medidas text check (length(medidas) <= 200),
  categoria text not null default 'Otras' check (categoria in ('Tazas', 'Cuencos', 'Platos', 'Jarrones', 'Macetas', 'Otras')),
  precio numeric(8,2) check (precio is null or precio >= 0),
  unidades int not null default 1 check (unidades between 0 and 999),
  estado text not null default 'disponible' check (estado in ('disponible', 'reservada', 'vendida', 'oculta')),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 6),
  orden int not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
drop trigger if exists tienda_tocar on public.tienda;
create trigger tienda_tocar before insert or update on public.tienda
  for each row execute function public.registros_tocar();

revoke insert, update, delete on public.tienda from anon;
grant select on public.tienda to anon, authenticated;
grant insert, update, delete on public.tienda to authenticated;
alter table public.tienda enable row level security;
drop policy if exists "Tienda: todos la ven" on public.tienda;
create policy "Tienda: todos la ven" on public.tienda for select to anon, authenticated
  using (estado <> 'oculta' or public.es_admin());
drop policy if exists "Tienda: el taller la cambia" on public.tienda;
create policy "Tienda: el taller la cambia" on public.tienda for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tienda', 'tienda', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Tienda: subir fotos" on storage.objects;
create policy "Tienda: subir fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tienda' and public.es_admin());
drop policy if exists "Tienda: ver fotos" on storage.objects;
create policy "Tienda: ver fotos" on storage.objects for select to authenticated
  using (bucket_id = 'tienda' and public.es_admin());
drop policy if exists "Tienda: borrar fotos" on storage.objects;
create policy "Tienda: borrar fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'tienda' and public.es_admin());

-- ============================================================
-- Comunidad: categoría «Inspiración» para publicar tableros
-- ============================================================
-- Si la tabla ya existía, se cambia la regla de categorías. El tablero va en
-- «adjunto» ({ tipo: 'tablero', id: enlace compartido, nombre }) y quien lo ve
-- se lo guarda desde ese enlace.
alter table public.publicaciones drop constraint if exists publicaciones_categoria_check;
alter table public.publicaciones add constraint publicaciones_categoria_check
  check (categoria in ('esmaltes', 'recetas', 'problemas', 'piezas', 'charla', 'inspiracion'));
