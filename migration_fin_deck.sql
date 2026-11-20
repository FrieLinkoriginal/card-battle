-- Termine la partie au lieu de la bloquer lorsque tous les joueurs ont joué leur deck.
do $m$
declare f text; needle text := 'select * into nxt from players where game_id=p_game and hp>0';
patch text := $patch$
 if g.deck_required and not exists (
   select 1 from game_deck d join players p on p.game_id=d.game_id and p.user_id=d.owner
   left join board b on b.game_id=d.game_id and b.owner=d.owner and b.card_id=d.card_id
   where d.game_id=p_game and p.hp>0 and b.id is null
 ) then
   if g.mode='teams' then
     select max(score) into highscore from (select sum(hp) score from players where game_id=p_game group by team) scores;
     select count(*),min('Équipe '||team::text) into n,winner_ from (select team from players where game_id=p_game group by team having sum(hp)=highscore) winners;
   else
     select max(hp) into highscore from players where game_id=p_game and hp>0;
     select count(*),min(name) into n,winner_ from players where game_id=p_game and hp=highscore;
   end if;
   if n>1 then winner_:='Égalité'; end if;
   update games set status='finished',winner=winner_ where id=p_game;
   insert into game_log(game_id,message) values(p_game,'Decks épuisés : '||winner_||'.');
   return;
 end if;
 $patch$;
begin
 select pg_get_functiondef('public.end_turn(uuid)'::regprocedure) into f;
 if position(needle in f)=0 or position('declare g games; me players; nxt players; income int;' in f)=0 then raise exception 'La fonction end_turn attendue est introuvable'; end if;
 f:=replace(f,'declare g games; me players; nxt players; income int;', 'declare g games; me players; nxt players; income int; highscore int; n int; winner_ text;');
 f:=replace(f,needle,patch||needle);
 execute f;
end $m$;
