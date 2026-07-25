# 8-Ball Pool Rules

This document describes the rule set implemented by the 8-ball backend engine in `games/8ball/backend/app/services/game_service.py`.

## 1. Objective

- Each player is assigned a ball group: **solids** (1-7) or **stripes** (9-15).
- A player wins by legally pocketing the **8-ball** after all balls of their own group have been pocketed.
- A player loses immediately if they pocket the 8-ball illegally.

## 2. Setup and Break

- The game starts with player 1 breaking.
- Balls are racked in a triangle with the 8-ball in the center, one solid on the apex, and solids/stripes distributed on the corners/sides.
- The cue ball starts on the **head spot** (left side of the table).
- The break shot is legal if the cue ball hits the rack and either:
  - at least one object ball is pocketed, or
  - at least four object balls touch a cushion.
- A scratch on the break (cue ball pocketed) is a foul and gives the opponent ball-in-hand.
- If the 8-ball is pocketed on the break, it is spotted on the foot spot and the opponent receives ball-in-hand.

## 3. Open Table / Group Assignment

- The table is "open" until a player legally pockets a solid or stripe on a non-break shot.
- The first legally pocketed ball on a non-break shot determines the shooter's group.
  - If a solid is pocketed, that player becomes solids and the opponent becomes stripes.
  - If a stripe is pocketed, that player becomes stripes and the opponent becomes solids.
- Pocketing the 8-ball on an open table is an instant loss.

## 4. Legal Shot

A shot is legal only if all of the following are true:

1. **First contact:** the cue ball's first contact must be a ball from the shooter's own group.  
   - On an open table, first contact can be any solid or stripe (not the 8-ball).
   - When shooting at the 8-ball, first contact must be the 8-ball.
2. **Rail or pocket:** after first contact, either an object ball must be pocketed OR at least one ball must touch a cushion.  
   *(Rail-after-contact rule is enforced when the client provides cushion-hit data; currently the engine relies on pocketed balls and first contact for turn decisions.)*
3. **Cue ball remains on the table:** pocketing the cue ball is a scratch foul.

## 5. Fouls

The following are fouls and result in **ball-in-hand** for the opponent:

- **Scratch:** cue ball is pocketed.
- **Wrong first contact:** hitting the opponent's group ball, the 8-ball, or no ball first.
- **Pocketing opponent's ball:** pocketing any ball from the opponent's group.
- **Illegal break:** no ball pocketed and fewer than four balls hit a cushion.
- **No rail:** no ball touches a cushion and no ball is pocketed after first contact.

## 6. Continuing / Passing Turn

- If the shot is legal and the shooter pockets at least one ball from their own group, they continue shooting.
- If the shot is legal but no own-group ball is pocketed, the turn passes.
- If the shot is a foul, the turn passes and the incoming player gets ball-in-hand.
- Pocketing the cue ball (scratch) always ends the turn.

## 7. 8-Ball Rules

- A player may only shoot at the 8-ball after all balls of their own group have been pocketed.
- Pocketing the 8-ball after clearing the group wins the game.
- Pocketing the 8-ball before clearing the group is an instant loss.
- Pocketing the 8-ball in the same shot as the last group ball is allowed and wins the game.
- Scratching while shooting at the 8-ball (regardless of whether the 8-ball drops) is an instant loss.

## 8. Ball-in-Hand

- After any foul, the incoming player may place the cue ball anywhere on the table before their shot.
- For the current implementation, the server respawns the cue ball on the head spot and sets the `ball_in_hand` flag.
- A future client-side enhancement will allow the player to drag the cue ball to the desired location.

## 9. State and Event Output

After each shot, the server broadcasts a `shot_result` with:

- `pocketed`: list of pocketed ball numbers.
- `cue_pocketed`: whether the cue ball was pocketed.
- `foul`: true if the shot was a foul.
- `foul_reason`: e.g. `scratch`, `wrong_first_contact`, `opponent_ball`, `early_8_ball`, `no_contact`, `illegal_break`.
- `switch_turn`: true if the turn changes.
- `current_player`: the player whose turn it now is.
- `ball_in_hand`: true if the incoming player may place the cue ball.
- `game_over` / `winner`: emitted separately when the game ends.

## 10. Known Simplifications

- Physics simulation is client-side; the server validates the reported outcome.
- Cushion-hit counts are optional from the client; if omitted, the engine uses pocketed/first-contact data to decide fouls.
- Ball-in-hand placement is currently fixed to the head spot; free placement is planned.
