# match-viewer-prototype

A 2D football match viewer: it reads an event log and replays a full match from
minute 0 to 90 continuously, with a running clock, a camera that follows the ball,
a scoreboard, and zoom plus overlay on key moments.

Built as a working prototype, not a client project. The match log here is
synthetic (849 events over 90 minutes, one pitch position per event) and was
generated to exercise the parts that actually decide whether a replay engine
works: interpolation, reading order, camera, and an accelerated clock.

## Run it

Open `match_viewer_demo.html` in a browser. No build step, no backend, no
dependencies. Controls: play/pause, speed from 1x to 120x, and a seek bar.

## How it works

**State is a pure function of the log and the clock.** `stateAt(index, T)` in
`viewer.js` computes every player position, the ball, the score and the current
key moment from the log and `T` alone. Nothing is accumulated between frames.
Two consequences: seeking to any time is exact rather than approximate, and the
same log always produces the same replay.

**Moving a player between two events.** Each event is a keyframe for the player
it names. When a player has two events inside a short window they walk the real
line between them with an ease in and out and arrive at the logged position on
its timestamp. When the gap is long, holding a straight line for forty seconds
looks dead, so the player sits on a formation anchor and blends toward the logged
position only as the event approaches, and away from it afterwards. The log stays
authoritative; no path is invented that the log does not support.

**Keeping the other twenty plausible.** They are driven by shape rather than by
events. Each has an anchor in the team formation (4-4-2 and 4-3-3 here), the whole
block slides up and down the pitch with ball x and compresses or spreads as the
ball moves, and a small deterministic drift keyed to shirt number keeps them
breathing without ever becoming random.

**Key moments at speed.** At 45x a goal overlay flashes past in about two frames.
Cutting away or freezing the clock would break continuity, so instead the playback
rate itself is a function of the clock: `rateAt` dips near a goal or a card and
ramps back up over the following seconds. The moment becomes readable while the
match keeps running.

## Files

| file | what it is |
|---|---|
| `viewer.js` | engine: `buildIndex`, `stateAt`, `rateAt`, `cameraAt` |
| `render.js` | Canvas 2D renderer: pitch, busts, ball, camera transform, HUD |
| `gen_log.js` | deterministic synthetic log generator |
| `match_log.json` | the sample log used by the demo |
| `match_viewer_demo.html` | self-contained build, everything inlined |

## Notes

Players are drawn as static front-facing busts that move around the pitch, with
no limb animation. Canvas 2D here; the same state model drops onto PixiJS
unchanged, since the engine never touches the drawing layer.

If a per-tick position stream is available it can be preferred over the event
keyframes without changing anything else, because the anchor logic is only a
fallback for gaps the log does not fill.
