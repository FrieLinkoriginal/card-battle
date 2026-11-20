-- Migration Card Battle : decks de 10 cartes et instantané par partie.
alter table public.cards add column starter_key text;
create unique index cards_starter_key_unique on public.cards(owner, starter_key) where starter_key is not null;
create table public.deck_cards (owner uuid not null references auth.users(id), slot int not null check(slot between 1 and 10), card_id uuid not null references public.cards(id), primary key(owner,slot), unique(owner,card_id));
create table public.game_deck (game_id uuid not null references public.games(id) on delete cascade, owner uuid not null references auth.users(id), slot int not null check(slot between 1 and 10), card_id uuid not null references public.cards(id), primary key(game_id,owner,slot), unique(game_id,owner,card_id));
alter table public.deck_cards enable row level security;
alter table public.game_deck enable row level security;
create policy deck_read on public.deck_cards for select to authenticated using(owner=auth.uid());
create policy game_deck_read on public.game_deck for select to authenticated using(owner=auth.uid() and public.is_player(game_id));
alter table public.games add column deck_required boolean not null default false;

create function public.ensure_starter_deck() returns void language plpgsql security definer set search_path=public as $$
declare r record; img text; svg text;
begin
 if auth.uid() is null then raise exception 'Connexion requise'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from deck_cards where owner=auth.uid()) then return; end if;
 for r in select * from (values
 (1,'Braise','Feu',1,2,3,1,'#e57353'), (2,'Goutte','Eau',1,1,3,2,'#4daac0'),
 (3,'Pousse','Nature',2,3,4,1,'#71aa76'), (4,'Galet','Neutre',2,2,4,2,'#9d91bc'),
 (5,'Salamandre','Feu',3,3,5,2,'#e99157'), (6,'Ondine','Eau',3,4,5,1,'#5b94d6'),
 (7,'Sylve','Nature',4,4,6,2,'#85b76b'), (8,'Sentinelle','Neutre',4,3,6,3,'#9a8bc1'),
 (9,'Phénix','Feu',5,4,8,2,'#dc735b'), (10,'Léviathan','Eau',5,4,8,2,'#5c9db6')
 ) as t(n,nom,typ,prix,or_,att,def,couleur)
 loop
  svg:=format('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="270" viewBox="0 0 360 270"><rect width="360" height="270" fill="#1d2337"/><circle cx="180" cy="130" r="105" fill="%s" opacity=".25"/><path d="M65 203 Q95 160 120 170 Q115 95 151 77 L139 39 L178 64 Q190 59 202 64 L239 39 L228 79 Q264 98 250 170 Q280 168 296 203 Q245 235 180 235 Q115 235 65 203Z" fill="%s" stroke="#f5dec2" stroke-width="6" stroke-linejoin="round"/><circle cx="157" cy="137" r="7" fill="#191d30"/><circle cx="205" cy="137" r="7" fill="#191d30"/><path d="M168 160 Q180 170 192 160" fill="none" stroke="#191d30" stroke-width="5" stroke-linecap="round"/><circle cx="78" cy="78" r="4" fill="#fae3b4"/><path d="M282 59v20m-10-10h20" stroke="#fae3b4" stroke-width="3"/></svg>',r.couleur,r.couleur);
  img:='data:image/svg+xml;base64,'||replace(encode(convert_to(svg,'UTF8'),'base64'),E'\n','');
  insert into cards(owner,name,drawing,price,gold_stat,attack_stat,defense_stat,type,power,starter_key) values(auth.uid(),r.nom,img,r.prix,r.or_,r.att,r.def,r.typ,null,r.n::text)
  on conflict(owner,starter_key) where starter_key is not null do nothing;
 end loop;
 insert into deck_cards(owner,slot,card_id) select auth.uid(),c.starter_key::int,c.id from cards c where c.owner=auth.uid() and c.starter_key is not null;
end $$;
create function public.save_deck(p_cards uuid[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_cards is null or cardinality(p_cards)<>10 or (select count(distinct x) from unnest(p_cards) x)<>10 or (select count(*) from cards where owner=auth.uid() and id=any(p_cards))<>10 then raise exception 'Le deck doit contenir exactement 10 cartes différentes de votre collection'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 delete from deck_cards where owner=auth.uid();
 insert into deck_cards(owner,slot,card_id) select auth.uid(),i::int,p_cards[i] from generate_subscripts(p_cards,1) i;
end $$;
create or replace function public.start_game(p_game uuid) returns void language plpgsql security definer set search_path=public as $$
declare g games; n int;
begin
 select * into g from games where id=p_game for update;
 if not found or g.host<>auth.uid() or g.status<>'waiting' then raise exception 'Impossible de démarrer'; end if;
 select count(*) into n from players where game_id=p_game;
 if n<2 or (g.mode='teams' and n<>4) then raise exception 'Il faut au moins 2 joueurs, ou exactement 4 en équipes'; end if;
 if exists(select 1 from players p where p.game_id=p_game and (select count(*) from deck_cards d join cards c on c.id=d.card_id and c.owner=p.user_id where d.owner=p.user_id)<>10) then raise exception 'Chaque joueur doit avoir un deck complet de 10 cartes'; end if;
 insert into game_deck(game_id,owner,slot,card_id) select p_game,d.owner,d.slot,d.card_id from deck_cards d join players p on p.user_id=d.owner where p.game_id=p_game;
 update games set status='playing',deck_required=true where id=p_game;
 insert into game_log(game_id,message) values(p_game,'La bataille commence !');
end $$;
-- Le contrôle est effectué côté serveur, pas uniquement dans l’interface.
do $migration$
declare def text; needle text := 'if p_zone not in (''mine'',''attack'',''defense'') or p_zone is null then';
begin
 select pg_get_functiondef('public.play_card(uuid,uuid,text,uuid)'::regprocedure) into def;
 if position(needle in def)=0 then raise exception 'La fonction play_card attendue est introuvable'; end if;
 def:=replace(def,needle, 'if g.deck_required and not exists(select 1 from game_deck where game_id=p_game and owner=auth.uid() and card_id=p_card) then raise exception ''Cette carte ne fait pas partie de votre deck''; end if; ' || needle);
 execute def;
end $migration$;
revoke execute on function public.ensure_starter_deck(), public.save_deck(uuid[]) from public, anon;
grant execute on function public.ensure_starter_deck(), public.save_deck(uuid[]) to authenticated;
