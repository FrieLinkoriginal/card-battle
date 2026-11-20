-- Card Battle — exécuter dans l'éditeur SQL de Supabase, une seule fois.
-- Configurez la connexion technique indiquée dans le README.
create extension if not exists pgcrypto;
create table public.cards (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id),
 name text not null check (char_length(name) between 1 and 30), drawing text not null check (char_length(drawing) < 400000),
 price int not null check (price between 1 and 8), gold_stat int not null, attack_stat int not null, defense_stat int not null,
 type text not null, power text, created_at timestamptz not null default now()
);
create table public.games (
 id uuid primary key default gen_random_uuid(), code text unique not null, host uuid not null references auth.users(id),
 mode text not null check (mode in ('duel','melee','teams')), capacity int not null, status text not null default 'waiting',
 current_seat int not null default 0, round int not null default 1, played boolean not null default false, winner text, created_at timestamptz default now()
);
create table public.players (
 game_id uuid not null references public.games(id) on delete cascade, user_id uuid not null references auth.users(id),
 name text not null, seat int not null, team int, hp int not null default 40, gold int not null default 8,
 primary key(game_id,user_id), unique(game_id,seat)
);
create table public.board (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
 owner uuid not null references auth.users(id), card_id uuid not null references public.cards(id), zone text not null,
 hp int, created_at timestamptz default now(), unique(game_id,owner,card_id)
);
create table public.game_log (id bigint generated always as identity primary key, game_id uuid not null references public.games(id) on delete cascade, message text not null, created_at timestamptz default now());
alter table public.cards enable row level security;
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.board enable row level security;
alter table public.game_log enable row level security;
-- Accès en lecture aux parties uniquement pour leurs participants ; écritures exclusivement via RPC.
create function public.is_player(g uuid) returns boolean language sql security definer stable set search_path = public as $$ select exists(select 1 from players where game_id=g and user_id=auth.uid()) $$;
create policy cards_read on public.cards for select to authenticated using (owner=auth.uid() or exists(select 1 from board b where b.card_id=cards.id and public.is_player(b.game_id)));
create policy games_read on public.games for select to authenticated using (public.is_player(id));
create policy players_read on public.players for select to authenticated using (public.is_player(game_id));
create policy board_read on public.board for select to authenticated using (public.is_player(game_id));
create policy log_read on public.game_log for select to authenticated using (public.is_player(game_id));
create function public.make_card(p_name text,p_drawing text,p_price int) returns public.cards language plpgsql security definer set search_path=public as $$
declare budget int; a int; b int; c int; t text; pow text; result cards;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 30 or p_price not between 1 and 8 or p_drawing not like 'data:image/png;base64,%' or length(p_drawing)>400000 then raise exception 'Carte invalide'; end if;
 -- Le poids est un budget réparti aléatoirement ; un pouvoir consomme 2 points.
 budget := 4 + p_price*2; if random()<0.25 and budget>=6 then pow := (array['Prospecteur','Furie','Rempart'])[1+floor(random()*3)::int]; budget:=budget-2; end if;
 a:=1; b:=1; c:=1; for i in 1..(budget-3) loop case floor(random()*3)::int when 0 then a:=a+1; when 1 then b:=b+1; else c:=c+1; end case; end loop;
 t:=(array['Feu','Eau','Nature','Neutre'])[1+floor(random()*4)::int];
 insert into cards(owner,name,drawing,price,gold_stat,attack_stat,defense_stat,type,power) values(auth.uid(),trim(p_name),p_drawing,p_price,a,b,c,t,pow) returning * into result; return result;
end $$;
create function public.create_game(p_name text,p_mode text) returns text language plpgsql security definer set search_path=public as $$
declare g uuid; code_ text; cap int;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 20 or p_mode not in ('duel','melee','teams') then raise exception 'Paramètres invalides'; end if;
 cap:=case p_mode when 'duel' then 2 when 'teams' then 4 else 5 end;
 code_:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into games(code,host,mode,capacity) values(code_,auth.uid(),p_mode,cap) returning id into g;
 insert into players(game_id,user_id,name,seat,team) values(g,auth.uid(),trim(p_name),0,case when p_mode='teams' then 1 else null end);
 return code_;
end $$;
create function public.join_game(p_code text,p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare g games; n int;
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 20 then raise exception 'Pseudo invalide'; end if;
 select * into g from games where code=upper(trim(p_code)) for update; if not found then raise exception 'Salon introuvable'; end if;
 if exists(select 1 from players where game_id=g.id and user_id=auth.uid()) then return g.id; end if;
 if g.status<>'waiting' then raise exception 'Partie déjà commencée'; end if;
 select count(*) into n from players where game_id=g.id; if n>=g.capacity then raise exception 'Salon complet'; end if;
 insert into players(game_id,user_id,name,seat,team) values(g.id,auth.uid(),trim(p_name),n,case when g.mode='teams' then 1+(n%2) else null end);
 return g.id;
end $$;
create function public.start_game(p_game uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games; n int;
begin
 select * into g from games where id=p_game for update;
 if not found or g.host<>auth.uid() or g.status<>'waiting' then raise exception 'Impossible de démarrer'; end if;
 select count(*) into n from players where game_id=p_game;
 if n<2 or (g.mode='teams' and n<>4) then raise exception 'Il faut au moins 2 joueurs, ou exactement 4 en équipes'; end if;
 update games set status='playing' where id=p_game;
 insert into game_log(game_id,message) values(p_game,'La bataille commence !');
end $$;
create function public.play_card(p_game uuid,p_card uuid,p_zone text,p_target uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare g games; me players; target_ players; card_ cards; guard_ record; dmg int; blocked int; winner_ text;
begin
 select * into g from games where id=p_game for update; select * into me from players where game_id=p_game and user_id=auth.uid();
 if g.status is distinct from 'playing' or me.user_id is null or me.seat<>g.current_seat or me.hp<=0 then raise exception 'Ce n’est pas votre tour'; end if;
 select * into card_ from cards where id=p_card and owner=auth.uid(); if not found then raise exception 'Carte introuvable'; end if;
 if p_zone not in ('mine','attack','defense') or p_zone is null then raise exception 'Emplacement invalide'; end if;
 if g.played then raise exception 'Vous avez déjà joué une carte ce tour'; end if;
 if me.gold<card_.price then raise exception 'Pas assez d’or'; end if;
 if exists(select 1 from board where game_id=p_game and owner=auth.uid() and card_id=p_card) then raise exception 'Cette carte a déjà été jouée'; end if;
 if p_zone in ('mine','defense') and (select count(*) from board where game_id=p_game and owner=auth.uid() and zone=p_zone)>=3 then raise exception 'Emplacement complet'; end if;
 if p_zone='attack' then
   select * into target_ from players where game_id=p_game and user_id=p_target and hp>0;
   if not found or target_.user_id=me.user_id or (g.mode='teams' and target_.team=me.team) then raise exception 'Cible invalide'; end if;
 end if;
 update players set gold=gold-card_.price where game_id=p_game and user_id=auth.uid();
 update games set played=true where id=p_game;
 insert into board(game_id,owner,card_id,zone,hp) values(p_game,auth.uid(),p_card,case when p_zone='attack' then 'used' else p_zone end,case when p_zone='defense' then card_.defense_stat+case when card_.power='Rempart' then 2 else 0 end else null end);
 if p_zone='attack' then
   dmg:=card_.attack_stat+case when card_.power='Furie' then 2 else 0 end;
   select b.id,b.hp,c.type into guard_ from board b join cards c on c.id=b.card_id where b.game_id=p_game and b.owner=target_.user_id and b.zone='defense' order by b.created_at,b.id limit 1;
   if found then
     -- Feu > Nature > Eau > Feu, avantage +2 / désavantage -2 (minimum 1).
     if (card_.type,guard_.type) in (('Feu','Nature'),('Nature','Eau'),('Eau','Feu')) then dmg:=dmg+2;
     elsif (guard_.type,card_.type) in (('Feu','Nature'),('Nature','Eau'),('Eau','Feu')) then dmg:=greatest(1,dmg-2); end if;
     blocked:=least(dmg,guard_.hp); update board set hp=hp-blocked,zone=case when hp-blocked<=0 then 'used' else zone end where id=guard_.id; dmg:=dmg-blocked;
   end if;
   update players set hp=greatest(0,hp-dmg) where game_id=p_game and user_id=target_.user_id;
   insert into game_log(game_id,message) values(p_game,me.name||' attaque '||target_.name||' avec '||card_.name||' : '||dmg||' dégâts au roi.');
   if g.mode='teams' then
     if (select count(distinct team) from players where game_id=p_game and hp>0)=1 then select 'Équipe '||team into winner_ from players where game_id=p_game and hp>0 limit 1; end if;
   elsif (select count(*) from players where game_id=p_game and hp>0)=1 then select name into winner_ from players where game_id=p_game and hp>0 limit 1; end if;
   if winner_ is not null then update games set status='finished',winner=winner_ where id=p_game; insert into game_log(game_id,message) values(p_game,'Victoire : '||winner_||' !'); end if;
 else insert into game_log(game_id,message) values(p_game,me.name||' place '||card_.name||case when p_zone='mine' then ' à la mine.' else ' en défense.' end); end if;
end $$;
create function public.end_turn(p_game uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games; me players; nxt players; income int;
begin
 select * into g from games where id=p_game for update; select * into me from players where game_id=p_game and user_id=auth.uid();
 if g.status is distinct from 'playing' or me.user_id is null or me.seat<>g.current_seat or me.hp<=0 then raise exception 'Ce n’est pas votre tour'; end if;
 select * into nxt from players where game_id=p_game and hp>0 order by case when seat>me.seat then 0 else 1 end,seat limit 1;
 select coalesce(sum(c.gold_stat+case when c.power='Prospecteur' then 2 else 0 end),0)::int into income from board b join cards c on c.id=b.card_id where b.game_id=p_game and b.owner=nxt.user_id and b.zone='mine';
 update players set gold=gold+2+income where game_id=p_game and user_id=nxt.user_id;
 update games set current_seat=nxt.seat,played=false,round=round+case when nxt.seat<=me.seat then 1 else 0 end where id=p_game;
 insert into game_log(game_id,message) values(p_game,'Tour de '||nxt.name||' : +'||(2+income)||' or.');
end $$;
-- Interdire l'appel non authentifié et restreindre les fonctions publiques sensibles.
revoke execute on function public.make_card(text,text,int),public.create_game(text,text),public.join_game(text,text),public.start_game(uuid),public.play_card(uuid,uuid,text,uuid),public.end_turn(uuid) from public, anon;
grant execute on function public.make_card(text,text,int),public.create_game(text,text),public.join_game(text,text),public.start_game(uuid),public.play_card(uuid,uuid,text,uuid),public.end_turn(uuid) to authenticated;
