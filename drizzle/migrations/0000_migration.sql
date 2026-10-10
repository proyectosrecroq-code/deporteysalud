
create table public.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  phone text not null unique,
  pin text not null default '0000',
  birth_date date,
  join_date date not null default current_date,
  active boolean not null default true,
  plan_days int not null default 2,
  schedule jsonb not null default '{}'::jsonb,
  conditions text[] not null default '{}',
  notes text not null default '',
  consent boolean not null default false,
  consent_date date,
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  month text not null,
  amount numeric not null default 0,
  method text,
  paid boolean not null default false,
  paid_at timestamptz,
  unique(member_id, month)
);
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null default current_date,
  type text not null default 'Completo',
  title text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null
);
create table public.member_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  type text not null,
  day text,
  desired_time text,
  message text not null default '',
  status text not null default 'pendiente',
  created_at timestamptz not null default now()
);
create table public.settings (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb
);

do $$ declare t text; begin
  foreach t in array array['members','payments','exercises','workouts','conditions','member_requests','settings'] loop
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

insert into public.settings(id, data) values (1, '{
 "owner_password":"",
 "capacity":6,
 "overlap_max":1,
 "tariffs":{"2":90,"3":120,"4":150},
 "open_days":["L","M","X","J","V"],
 "class_times":["07:30","08:30","09:30","10:30","11:30","16:30","17:30","18:30","19:30","20:30"],
 "payment_methods":["BIZUM","EFECTIVO","TARJETA","TRANSFERENCIA"],
 "exercise_categories":["Calentamiento","Activación","Fuerza","Aeróbico","Core","Movilidad"]
}');

insert into public.conditions(name, kind) values
('Lumbalgia','lesion'),('Tendinitis rotuliana','lesion'),('Esguince de tobillo','lesion'),('Hombro doloroso','lesion'),('Epicondilitis','lesion'),('Hernia discal','lesion'),('Rotura fibrilar','lesion'),
('Hipertensión','patologia'),('Diabetes tipo 2','patologia'),('Artrosis','patologia'),('Osteoporosis','patologia'),('Asma','patologia'),('Hipotiroidismo','patologia'),
('Embarazo / posparto','condicion'),('Sobrepeso','condicion'),('Sedentarismo','condicion'),('Mayor de 65','condicion'),('Prótesis de cadera/rodilla','condicion'),
('Pérdida de peso','objetivo'),('Ganar fuerza','objetivo'),('Ganar masa muscular','objetivo'),('Mejorar resistencia','objetivo'),('Preparar Hyrox','objetivo'),('Salud general','objetivo'),('Readaptación de lesión','objetivo'),('Movilidad','objetivo');

insert into public.exercises(name, category) values
('Remo ergómetro','Calentamiento'),('Airbike','Calentamiento'),('Comba','Calentamiento'),('Skierg','Calentamiento'),
('Puente de glúteo','Activación'),('Band pull-apart','Activación'),('Monster walk','Activación'),('Dead bug','Activación'),('Bird dog','Activación'),
('Sentadilla trasera','Fuerza'),('Peso muerto','Fuerza'),('Press banca','Fuerza'),('Press militar','Fuerza'),('Dominadas','Fuerza'),('Remo con barra','Fuerza'),('Zancadas','Fuerza'),('Hip thrust','Fuerza'),('Goblet squat','Fuerza'),('Kettlebell swing','Fuerza'),('Thruster','Fuerza'),
('Burpees','Aeróbico'),('Wall balls','Aeróbico'),('Box jumps','Aeróbico'),('Sled push','Aeróbico'),('Farmer carry','Aeróbico'),('Sandbag lunges','Aeróbico'),('Carrera 400m','Aeróbico'),
('Plancha','Core'),('Hollow hold','Core'),('Pallof press','Core'),
('Movilidad de cadera','Movilidad'),('Movilidad torácica','Movilidad');

with m as (
 insert into public.members(first_name,last_name,phone,pin,birth_date,join_date,plan_days,schedule,conditions,consent,consent_date) values
 ('Laura','García López','600111001','1234','1990-03-12','2024-01-10',3,'{"L":"09:30","X":"09:30","V":"09:30"}','{Lumbalgia,"Pérdida de peso"}',true,'2024-01-10'),
 ('Carlos','Martín Ruiz','600111002','1234','1985-10-14','2023-06-01',4,'{"L":"18:30","M":"18:30","J":"18:30","V":"18:30"}','{"Ganar fuerza"}',true,'2023-06-01'),
 ('Ana','Sánchez Pérez','600111003','1234','1978-07-22','2024-09-15',2,'{"M":"10:30","J":"10:30"}','{Hipertensión,"Salud general"}',true,'2024-09-15'),
 ('Javier','Romero Gil','600111004','1234','1995-10-12','2025-02-03',3,'{"L":"19:30","X":"19:30","V":"19:30"}','{"Preparar Hyrox"}',true,'2025-02-03'),
 ('Marta','Díaz Torres','600111005','1234','1960-01-30','2022-11-20',2,'{"L":"10:30","X":"10:30"}','{Artrosis,"Mayor de 65",Movilidad}',true,'2022-11-20'),
 ('Pablo','Navarro Ortiz','600111006','1234','1988-05-05','2025-05-12',3,'{"M":"18:30","J":"18:30","V":"18:30"}','{"Tendinitis rotuliana","Readaptación de lesión"}',true,'2025-05-12'),
 ('Lucía','Moreno Vega','600111007','1234','1992-12-01','2025-08-01',4,'{"L":"09:30","M":"09:30","X":"09:30","J":"09:30"}','{"Ganar masa muscular"}',true,'2025-08-01'),
 ('Sergio','Jiménez Castro','600111008','1234','1980-04-18','2024-03-11',2,'{"L":"10:00","X":"10:00"}','{"Hombro doloroso","Ganar fuerza"}',true,'2024-03-11'),
 ('Elena','Ruiz Herrera','600111009','1234','1999-10-13','2026-01-15',3,'{"M":"17:30","J":"17:30","V":"17:30"}','{"Mejorar resistencia"}',true,'2026-01-15'),
 ('David','Alonso Prieto','600111010','1234','1975-09-09','2023-01-09',2,'{"M":"19:30","J":"19:30"}','{"Diabetes tipo 2",Sobrepeso,"Pérdida de peso"}',true,'2023-01-09'),
 ('Raquel','Gómez Ramos','600111011','1234','1983-02-25','2025-10-01',3,'{"L":"18:30","X":"18:30","V":"18:30"}','{"Embarazo / posparto","Salud general"}',true,'2025-10-01'),
 ('Miguel','Fernández Soto','600111012','1234','1968-06-30','2024-06-20',2,'{"L":"09:30","X":"09:30"}','{Osteoporosis,Movilidad}',false,null),
 ('Irene','Castillo Mora','600111013','1234','2001-11-11','2026-04-04',4,'{"L":"19:30","M":"19:30","X":"19:30","J":"19:30"}','{"Preparar Hyrox","Mejorar resistencia"}',true,'2026-04-04'),
 ('Hugo','Serrano Cano','600111014','1234','1993-08-08','2025-12-01',3,'{"L":"09:30","X":"09:30","V":"09:30"}','{Sedentarismo,"Pérdida de peso"}',true,'2025-12-01')
 returning id, plan_days, phone
)
insert into public.payments(member_id, month, amount, method, paid, paid_at)
select id, to_char(now(),'YYYY-MM'), case plan_days when 2 then 90 when 3 then 120 else 150 end,
  case when right(phone,1)::int % 4 = 0 then 'BIZUM' when right(phone,1)::int % 4 = 1 then 'EFECTIVO' when right(phone,1)::int % 4 = 2 then 'TARJETA' else 'TRANSFERENCIA' end,
  right(phone,1)::int % 3 <> 0, case when right(phone,1)::int % 3 <> 0 then now() end
from m;

insert into public.payments(member_id, month, amount, method, paid, paid_at)
select m.id, to_char(now() - (g || ' month')::interval,'YYYY-MM'), case plan_days when 2 then 90 when 3 then 120 else 150 end,
 'BIZUM', not (g=1 and right(phone,2)='10'), now() - (g || ' month')::interval
from public.members m, generate_series(1,5) g where m.join_date < (now() - (g || ' month')::interval)::date;

insert into public.member_requests(member_id, type, day, desired_time, message)
select id, 'cambio', 'X', '18:30', 'Esta semana tengo reunión por la mañana' from public.members where phone='600111001';
insert into public.member_requests(member_id, type, day, message)
select id, 'ausencia', 'J', 'Cita médica' from public.members where phone='600111003';
