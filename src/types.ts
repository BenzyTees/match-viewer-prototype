/** Match log schema. One pitch position per event; nothing per tick. */

export type TeamId = 'home' | 'away';

export type EventType =
  | 'kickoff'      // restart from the centre spot
  | 'pass'         // ball played to a teammate (see `to`)
  | 'carry'        // player runs with the ball
  | 'cross'        // ball played into the box from a wide area
  | 'shot'         // attempt on goal (see `outcome`)
  | 'save'         // goalkeeper stops the ball (ball then with the keeper)
  | 'goal'         // ball crosses the line, score updated (see `score`)
  | 'tackle'       // possession won on the ground
  | 'interception' // pass cut out
  | 'clearance'    // ball hoofed away under pressure
  | 'foul'         // by `team`/`player`; may carry `card`
  | 'freekick'
  | 'corner'
  | 'throwin'
  | 'goalkick'
  | 'out'          // ball leaves play at x,y (player 0)
  | 'halftime'
  | 'fulltime';

export type Outcome = 'complete' | 'intercepted' | 'out' | 'saved' | 'goal' | 'wide' | 'blocked';

export interface MatchEvent {
  /** match clock in seconds, 0..5400, monotonic */
  t: number;
  type: EventType;
  /** team performing the action (for `out`, the team that last touched) */
  team: TeamId;
  /** shirt number 1..11; 0 when no player is involved */
  player: number;
  /** pitch metres, origin top-left corner, x along the length, y along the width */
  x: number;
  y: number;
  /** intended receiver for pass / cross */
  to?: number;
  outcome?: Outcome;
  card?: 'yellow' | 'red';
  /** running score after this event, present on `goal` (and on kickoff for convenience) */
  score?: { home: number; away: number };
  /** 1 or 2; home attacks +x in period 1 and -x in period 2 */
  period?: 1 | 2;
}

export interface TeamMeta {
  name: string;
  short: string;
  formation: string;
  kit: { shirt: string; shorts: string; trim: string; gk: string; skin?: string };
}

export interface MatchLog {
  meta: { home: TeamMeta; away: TeamMeta; durationSec: number; halftimeSec: number };
  pitch: { w: number; h: number };
  events: MatchEvent[];
}
