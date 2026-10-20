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
