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
