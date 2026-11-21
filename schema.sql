-- Card Battle — nouveau jeu. À exécuter une seule fois sur un projet vierge.
-- Le projet de démonstration est déjà configuré : ne pas exécuter ce script dessus.
create table public.cb3_profiles(user_id uuid primary key references auth.users(id), created_at timestamptz default now());
create table public.cb3_cards(id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id), name text not null, art text not null, music text, price int not null, element text not null, gold int not null, attack int not null, defense int not null, power text, in_deck boolean not null default true, created_at timestamptz default now());
create table public.cb3_drafts(owner uuid primary key references auth.users(id), price int not null, stats jsonb not null);
create table public.cb3_rooms(id uuid primary key default gen_random_uuid(), code text unique not null, host uuid not null references auth.users(id), mode text not null, share boolean not null default false, status text not null default 'waiting', current_seat int not null default 0, center uuid, winner text, created_at timestamptz default now());
create table public.cb3_players(room uuid not null references public.cb3_rooms(id) on delete cascade, uid uuid not null references auth.users(id), name text not null, seat int not null, team int, hp int not null default 20, coins int not null default 1, turns int not null default 0, reroll boolean not null default false, alive boolean not null default true, primary key(room,uid), unique(room,seat));
create table public.cb3_pieces(id uuid primary key default gen_random_uuid(), room uuid not null references public.cb3_rooms(id) on delete cascade, holder uuid not null references auth.users(id), card uuid not null references public.cb3_cards(id), zone text not null check(zone in ('deck','hand','mine','center','discard')), unique(room,card));
create table public.cb3_events(id bigint generated always as identity primary key, room uuid not null references public.cb3_rooms(id) on delete cascade, message text not null, card uuid references public.cb3_cards(id), created_at timestamptz default now());
alter table public.cb3_profiles enable row level security; alter table public.cb3_cards enable row level security; alter table public.cb3_drafts enable row level security; alter table public.cb3_rooms enable row level security; alter table public.cb3_players enable row level security; alter table public.cb3_pieces enable row level security; alter table public.cb3_events enable row level security;
create policy cb3_cards_owner on public.cb3_cards for select to authenticated using(owner=auth.uid());
grant select on public.cb3_cards to authenticated;

CREATE OR REPLACE FUNCTION public.cb3_advance(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;p cb3_players;old_ uuid[];income int;
begin
 if cb3_check_end(p_room) then return;end if;
 loop
  select * into r from cb3_rooms where id=p_room;
  select * into p from cb3_players where room=p_room and alive order by case when seat>r.current_seat then 0 else 1 end,seat limit 1;
  update cb3_rooms set current_seat=p.seat where id=p_room;
  if p.turns>0 then
   select coalesce(sum(c.gold+case when c.power='Prospecteur' then 2 else 0 end),0)::int into income from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.holder=p.uid and x.zone='mine';
   update cb3_players set coins=coins+income where room=p_room and uid=p.uid;
   if p.reroll then
    select coalesce(array_agg(id),'{}'::uuid[]) into old_ from cb3_pieces where room=p_room and holder=p.uid and zone='hand';
    update cb3_pieces set zone='deck' where room=p_room and holder=p.uid and zone='hand';update cb3_players set reroll=false where room=p_room and uid=p.uid;
    for i in 1..3 loop exit when not cb3_draw(p_room,p.uid,old_);end loop;
   else perform cb3_draw(p_room,p.uid);end if;
  end if;
  if cb3_check_end(p_room) then return;end if;
  if exists(select 1 from cb3_players where room=p_room and uid=p.uid and alive) then
   update cb3_players set turns=turns+1 where room=p_room and uid=p.uid;
   insert into cb3_events(room,message) values(p_room,'Tour de '||p.name||'.');return;
  end if;
 end loop;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_check_end(p_room uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;winner_ text;n int;
begin
 select * into r from cb3_rooms where id=p_room;if r.status<>'playing' then return true;end if;
 if r.mode='teams' then
  select count(distinct team) into n from cb3_players where room=p_room and alive;
  if n=1 then select 'Équipe '||team into winner_ from cb3_players where room=p_room and alive limit 1;elsif n=0 then winner_:='Égalité';end if;
 else select count(*) into n from cb3_players where room=p_room and alive;if n=1 then select name into winner_ from cb3_players where room=p_room and alive limit 1;elsif n=0 then winner_:='Égalité';end if;end if;
 if winner_ is not null then update cb3_rooms set status='finished',winner=winner_ where id=p_room;insert into cb3_events(room,message) values(p_room,'Fin de partie : '||winner_||' !');return true;end if;return false;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_create_room(p_name text, p_mode text, p_share boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; code_ text;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 20 or p_mode not in ('duel','melee','teams') then raise exception 'Paramètres invalides';end if;
 code_:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));insert into cb3_rooms(code,host,mode,share) values(code_,auth.uid(),p_mode,coalesce(p_share,false)) returning id into rid;
 insert into cb3_players(room,uid,name,seat,team) values(rid,auth.uid(),trim(p_name),0,case when p_mode='teams' then 1 else null end);return code_;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_draw(p_room uuid, p_uid uuid, p_old uuid[] DEFAULT '{}'::uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare x uuid;
begin
 select id into x from cb3_pieces where room=p_room and holder=p_uid and zone='deck' order by case when id=any(p_old) then 1 else 0 end,random() limit 1;
 if x is null then perform cb3_eliminate(p_room,p_uid,'pioche vide');return false;end if;
 update cb3_pieces set zone='hand' where id=x;
 if not exists(select 1 from cb3_pieces where room=p_room and holder=p_uid and zone='deck') then perform cb3_eliminate(p_room,p_uid,'dernière carte piochée');return false;end if;return true;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_eliminate(p_room uuid, p_uid uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare center_ uuid;
begin
 if not exists(select 1 from cb3_players where room=p_room and uid=p_uid and alive) then return;end if;
 update cb3_players set alive=false,hp=greatest(0,hp) where room=p_room and uid=p_uid;
 select r.center into center_ from cb3_rooms r join cb3_pieces x on x.id=r.center where r.id=p_room and x.holder=p_uid;
 if center_ is not null then update cb3_pieces set zone='discard' where id=center_;update cb3_rooms set center=null where id=p_room;end if;
 update cb3_pieces set zone='discard' where room=p_room and holder=p_uid and zone='mine';
 insert into cb3_events(room,message) select p_room,name||' est éliminé : '||p_reason from cb3_players where room=p_room and uid=p_uid;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_init()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j jsonb; pr int; i int; svg text;
begin
 if auth.uid() is null then raise exception 'Connexion requise';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if exists(select 1 from cb3_profiles where user_id=auth.uid()) then return;end if;
 insert into cb3_profiles(user_id) values(auth.uid());
 svg:='data:image/svg+xml;base64,'||replace(encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 220"><rect width="300" height="220" fill="#252538"/><circle cx="150" cy="110" r="85" fill="#f2b681" opacity=".18"/><path d="M73 165 Q85 95 110 80 L101 40 L137 62 Q151 55 165 62 L200 40 L191 80 Q225 105 225 165 Q150 205 73 165Z" fill="#d78f68" stroke="#f8dbba" stroke-width="6"/><circle cx="126" cy="120" r="6"/><circle cx="174" cy="120" r="6"/><path d="M139 145 Q150 155 161 145" fill="none" stroke="#292235" stroke-width="4"/></svg>','UTF8'),'base64'),E'\n','');
 for i in 1..20 loop pr:=case when i<=6 then 1 else 1+floor(random()*5)::int end;j:=cb3_stats(pr);insert into cb3_cards(owner,name,art,price,element,gold,attack,defense,power) values(auth.uid(),'Créature '||i,svg,pr,j->>'element',(j->>'gold')::int,(j->>'attack')::int,(j->>'defense')::int,j->>'power');end loop;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_join_room(p_code text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;n int;cap int;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 20 then raise exception 'Pseudo invalide';end if;
 select * into r from cb3_rooms where code=upper(trim(p_code)) for update;if not found then raise exception 'Salon introuvable';end if;
 if exists(select 1 from cb3_players where room=r.id and uid=auth.uid()) then return r.id;end if;
 if r.status<>'waiting' then raise exception 'Cette partie a déjà commencé';end if;
 cap:=case r.mode when 'duel' then 2 when 'teams' then 4 else 5 end;select count(*) into n from cb3_players where room=r.id;if n>=cap then raise exception 'Salon complet';end if;
 insert into cb3_players(room,uid,name,seat,team) values(r.id,auth.uid(),trim(p_name),n,case when r.mode='teams' then 1+(n%2) else null end);return r.id;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_play(p_room uuid, p_piece uuid, p_zone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;me cb3_players;x cb3_pieces;c cb3_cards;op cb3_cards;op_piece cb3_pieces;op_player cb3_players;threat boolean:=false;a int;d int;damage int;
begin
 select * into r from cb3_rooms where id=p_room for update;select * into me from cb3_players where room=p_room and uid=auth.uid();
 if r.status is distinct from 'playing' or me.uid is null or not me.alive or r.current_seat<>me.seat then raise exception 'Ce n’est pas votre tour';end if;
 if p_zone not in ('mine','attack','defense') then raise exception 'Zone invalide';end if;
 select * into x from cb3_pieces where id=p_piece and room=p_room and holder=auth.uid() and zone='hand';if not found then raise exception 'Carte absente de la main';end if;
 select * into c from cb3_cards where id=x.card;if c.price>me.coins then raise exception 'Pas assez de pièces';end if;
 if r.center is not null then select * into op_piece from cb3_pieces where id=r.center;select * into op from cb3_cards where id=op_piece.card;select * into op_player from cb3_players where room=p_room and uid=op_piece.holder;threat:=op_piece.holder<>me.uid and (r.mode<>'teams' or op_player.team<>me.team);end if;
 if p_zone in ('mine','attack') and threat then
  damage:=op.attack+case when op.power='Furie' then 2 else 0 end;
  update cb3_players set hp=greatest(0,hp-damage) where room=p_room and uid=me.uid returning * into me;
  insert into cb3_events(room,message) values(p_room,me.name||' subit '||damage||' dégâts.');
  if me.hp<=0 then perform cb3_eliminate(p_room,me.uid,'roi détruit');perform cb3_advance(p_room);return;end if;
 end if;
 update cb3_players set coins=coins-c.price where room=p_room and uid=me.uid;
 insert into cb3_events(room,message,card) values(p_room,me.name||' pose '||c.name||'.',c.id);
 if p_zone='mine' then update cb3_pieces set zone='mine' where id=x.id;
 elsif p_zone='attack' or not threat then
  if r.center is not null then update cb3_pieces set zone='discard' where id=r.center;end if;
  update cb3_pieces set zone='center' where id=x.id;update cb3_rooms set center=x.id where id=p_room;
 else
  a:=op.attack+case when op.power='Furie' then 2 else 0 end;d:=c.defense+case when c.power='Rempart' then 2 else 0 end;
  if (op.element,c.element) in (('Feu','Nature'),('Nature','Eau'),('Eau','Feu')) then a:=ceil(a*1.5)::int;
  elsif (c.element,op.element) in (('Feu','Nature'),('Nature','Eau'),('Eau','Feu')) then d:=ceil(d*1.5)::int;end if;
  if a>d then update cb3_pieces set zone='discard' where id=x.id;damage:=a-d;update cb3_players set hp=greatest(0,hp-damage) where room=p_room and uid=me.uid returning * into me;insert into cb3_events(room,message) values(p_room,'Attaque '||a||' contre défense '||d||' : '||damage||' dégâts au roi de '||me.name||'.');if me.hp<=0 then perform cb3_eliminate(p_room,me.uid,'roi détruit');end if;
  elsif d>a then update cb3_pieces set zone='discard' where id=r.center;update cb3_pieces set zone='center' where id=x.id;update cb3_rooms set center=x.id where id=p_room;insert into cb3_events(room,message) values(p_room,'Défense '||d||' contre attaque '||a||' : '||c.name||' prend l’agression.');
  else update cb3_pieces set zone='discard' where id in (r.center,x.id);update cb3_rooms set center=null where id=p_room;insert into cb3_events(room,message) values(p_room,'Égalité : les deux cartes vont à la défausse.');end if;
 end if;
 perform cb3_advance(p_room);
end $function$


CREATE OR REPLACE FUNCTION public.cb3_roll(p_price integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j jsonb;
begin if auth.uid() is null then raise exception 'Connexion requise';end if;j:=cb3_stats(p_price);insert into cb3_drafts(owner,price,stats) values(auth.uid(),p_price,j) on conflict(owner) do update set price=excluded.price,stats=excluded.stats;return j;end $function$


CREATE OR REPLACE FUNCTION public.cb3_save_card(p_name text, p_art text, p_music text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d cb3_drafts; cid uuid;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 30 or p_art not like 'data:image/png;base64,%' or length(p_art)>400000 or (p_music is not null and (p_music not like 'data:audio/%;base64,%' or length(p_music)>1400000)) then raise exception 'Carte ou musique invalide';end if;
 select * into d from cb3_drafts where owner=auth.uid() for update;if not found then raise exception 'Tirez les caractéristiques avant de créer la carte';end if;
 insert into cb3_cards(owner,name,art,music,price,element,gold,attack,defense,power) values(auth.uid(),trim(p_name),p_art,p_music,d.price,d.stats->>'element',(d.stats->>'gold')::int,(d.stats->>'attack')::int,(d.stats->>'defense')::int,d.stats->>'power') returning id into cid;delete from cb3_drafts where owner=auth.uid();return cid;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_skip(p_room uuid, p_piece uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;me cb3_players;op cb3_cards;op_player cb3_players;owner_ uuid;card_ uuid;damage int;
begin
 select * into r from cb3_rooms where id=p_room for update;select * into me from cb3_players where room=p_room and uid=auth.uid();
 if r.status is distinct from 'playing' or me.uid is null or not me.alive or r.current_seat<>me.seat then raise exception 'Ce n’est pas votre tour';end if;
 if exists(select 1 from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.holder=me.uid and x.zone='hand' and c.price<=me.coins) then raise exception 'Vous pouvez jouer une carte';end if;
 if not exists(select 1 from cb3_pieces where id=p_piece and room=p_room and holder=me.uid and zone='hand') then raise exception 'Choisissez une carte à défausser';end if;
 if r.center is not null then select x.holder,x.card into owner_,card_ from cb3_pieces x where x.id=r.center;select * into op from cb3_cards where id=card_;select * into op_player from cb3_players where room=p_room and uid=owner_;
  if owner_<>me.uid and (r.mode<>'teams' or op_player.team<>me.team) then damage:=op.attack+case when op.power='Furie' then 2 else 0 end;update cb3_players set hp=greatest(0,hp-damage) where room=p_room and uid=me.uid returning * into me;insert into cb3_events(room,message) values(p_room,me.name||' est sauté et subit '||damage||' dégâts.');end if;
 end if;
 if me.hp<=0 then perform cb3_eliminate(p_room,me.uid,'roi détruit');perform cb3_advance(p_room);return;end if;
 update cb3_pieces set zone='discard' where id=p_piece;update cb3_players set reroll=true where room=p_room and uid=me.uid;
 insert into cb3_events(room,message) values(p_room,me.name||' défausse une carte ; sa main sera renouvelée à son prochain tour.');perform cb3_advance(p_room);
end $function$


CREATE OR REPLACE FUNCTION public.cb3_sound(p_room uuid, p_event bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin if not exists(select 1 from cb3_players where room=p_room and uid=auth.uid()) then raise exception 'Accès refusé';end if;return (select c.music from cb3_events e join cb3_cards c on c.id=e.card where e.room=p_room and e.id=p_event);end $function$


CREATE OR REPLACE FUNCTION public.cb3_start(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;p record;rec record;piece_id uuid;n int;
begin
 select * into r from cb3_rooms where id=p_room for update;if not found or r.host<>auth.uid() or r.status<>'waiting' then raise exception 'Seul l’hôte peut lancer le salon';end if;
 select count(*) into n from cb3_players where room=p_room;if n<2 or (r.mode='teams' and n<>4) then raise exception 'Il faut 2 joueurs minimum, ou exactement 4 en équipes';end if;
 if exists(select 1 from cb3_players pl where pl.room=p_room and ((select count(*) from cb3_cards c where c.owner=pl.uid and c.in_deck)<4 or not exists(select 1 from cb3_cards c where c.owner=pl.uid and c.in_deck and c.price=1 and c.gold>0))) then raise exception 'Chaque joueur doit avoir au moins 4 cartes et une carte à 1 pièce qui produit de l’or';end if;
 insert into cb3_pieces(room,holder,card,zone) select p_room,c.owner,c.id,'deck' from cb3_cards c join cb3_players pl on pl.uid=c.owner where pl.room=p_room and c.in_deck;
 if r.share then
   for p in select * from cb3_players where room=p_room order by seat loop
    select x.id into piece_id from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.zone='deck' and c.price=1 and c.gold>0 order by random() limit 1;
    update cb3_pieces set holder=p.uid,zone='hand' where id=piece_id;
   end loop;
   for rec in select id from cb3_pieces where room=p_room and zone='deck' order by random() loop
    select p2.* into p from cb3_players p2 where p2.room=p_room order by (select count(*) from cb3_pieces x where x.room=p_room and x.holder=p2.uid and x.zone in ('hand','discard')),p2.seat limit 1;
    update cb3_pieces set holder=p.uid,zone='discard' where id=rec.id;
   end loop;
   update cb3_pieces set zone='deck' where room=p_room and zone='discard';
 else
   for p in select * from cb3_players where room=p_room order by seat loop
    select x.id into piece_id from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.holder=p.uid and x.zone='deck' and c.price=1 and c.gold>0 order by random() limit 1;
    update cb3_pieces set zone='hand' where id=piece_id;
   end loop;
 end if;
 for p in select * from cb3_players where room=p_room order by seat loop
  for i in 1..2 loop select id into piece_id from cb3_pieces where room=p_room and holder=p.uid and zone='deck' order by random() limit 1;update cb3_pieces set zone='hand' where id=piece_id;end loop;
 end loop;
 update cb3_players set turns=1 where room=p_room and seat=0;
 update cb3_rooms set status='playing',current_seat=0 where id=p_room;
 insert into cb3_events(room,message) values(p_room,'La partie commence : chaque roi possède 20 PV et 1 pièce.');
end $function$


CREATE OR REPLACE FUNCTION public.cb3_state(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cb3_rooms;res jsonb;
begin
 if not exists(select 1 from cb3_players where room=p_room and uid=auth.uid()) then raise exception 'Accès refusé';end if;
 select * into r from cb3_rooms where id=p_room;
 select jsonb_build_object('id',r.id,'code',r.code,'mode',r.mode,'share',r.share,'host',r.host,'status',r.status,'seat',r.current_seat,'winner',r.winner,
 'players',coalesce((select jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,'team',p.team,'hp',p.hp,'coins',p.coins,'alive',p.alive,'deck_count',(select count(*) from cb3_pieces x where x.room=p_room and x.holder=p.uid and x.zone='deck'),'hand_count',(select count(*) from cb3_pieces x where x.room=p_room and x.holder=p.uid and x.zone='hand'),'discard_count',(select count(*) from cb3_pieces x where x.room=p_room and x.holder=p.uid and x.zone='discard')) order by p.seat) from cb3_players p where p.room=p_room),'[]'::jsonb),
 'hand',coalesce((select jsonb_agg(jsonb_build_object('piece',x.id,'id',c.id,'name',c.name,'art',c.art,'price',c.price,'element',c.element,'gold',c.gold,'attack',c.attack,'defense',c.defense,'power',c.power,'music',c.music is not null)) from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.holder=auth.uid() and x.zone='hand'),'[]'::jsonb),
 'center',(select jsonb_build_object('piece',x.id,'holder',x.holder,'id',c.id,'name',c.name,'art',c.art,'price',c.price,'element',c.element,'gold',c.gold,'attack',c.attack,'defense',c.defense,'power',c.power) from cb3_pieces x join cb3_cards c on c.id=x.card where x.id=r.center),
 'mines',coalesce((select jsonb_agg(jsonb_build_object('holder',x.holder,'id',c.id,'name',c.name,'art',c.art,'gold',c.gold,'power',c.power)) from cb3_pieces x join cb3_cards c on c.id=x.card where x.room=p_room and x.zone='mine'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select id,message,card from cb3_events where room=p_room order by id desc limit 15) e),'[]'::jsonb)) into res;return res;
end $function$


CREATE OR REPLACE FUNCTION public.cb3_stats(p_price integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare budget int; a int:=1; b int:=1; c int:=1; pow text; t text;
begin
 if p_price<1 or p_price>20 then raise exception 'Prix entre 1 et 20'; end if;
 budget:=4+2*p_price; if random()<0.25 then pow:=(array['Prospecteur','Furie','Rempart'])[1+floor(random()*3)::int];budget:=budget-2;end if;
 for i in 1..(budget-3) loop case floor(random()*3)::int when 0 then a:=a+1; when 1 then b:=b+1; else c:=c+1; end case;end loop;
 t:=(array['Feu','Eau','Nature','Neutre'])[1+floor(random()*4)::int];return jsonb_build_object('gold',a,'attack',b,'defense',c,'element',t,'power',pow,'price',p_price,'budget',budget);
end $function$


CREATE OR REPLACE FUNCTION public.cb3_toggle_deck(p_card uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin update cb3_cards set in_deck=not in_deck where id=p_card and owner=auth.uid();if not found then raise exception 'Carte introuvable';end if;end $function$

-- Seules les actions destinées aux joueurs sont exposées.
revoke execute on function public.cb3_stats(int),public.cb3_eliminate(uuid,uuid,text),public.cb3_check_end(uuid),public.cb3_draw(uuid,uuid,uuid[]),public.cb3_advance(uuid) from public,anon,authenticated;
revoke execute on function public.cb3_init(),public.cb3_roll(int),public.cb3_save_card(text,text,text),public.cb3_toggle_deck(uuid),public.cb3_create_room(text,text,boolean),public.cb3_join_room(text,text),public.cb3_start(uuid),public.cb3_state(uuid),public.cb3_sound(uuid,bigint),public.cb3_play(uuid,uuid,text),public.cb3_skip(uuid,uuid) from public,anon;
grant execute on function public.cb3_init(),public.cb3_roll(int),public.cb3_save_card(text,text,text),public.cb3_toggle_deck(uuid),public.cb3_create_room(text,text,boolean),public.cb3_join_room(text,text),public.cb3_start(uuid),public.cb3_state(uuid),public.cb3_sound(uuid,bigint),public.cb3_play(uuid,uuid,text),public.cb3_skip(uuid,uuid) to authenticated;
