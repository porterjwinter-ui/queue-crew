# Queue Crew

## Play: **[porterjwinter-ui.github.io/queue-crew](https://porterjwinter-ui.github.io/queue-crew/)**

Open that link on your phone. To keep it like an app, tap **Share**, then **Add to Home Screen** (iPhone), or open the browser menu and tap **Add to Home screen** (Android). After the first visit it works with no signal. Nothing needs to be installed or run on the phone.

Party games for waiting in line, made for phones.

## The games

| Game | Like | Players |
|------|------|---------|
| **Forehead** | Heads Up — phone on your forehead, nod = got it, tilt up = skip | 2+ |
| **Imposter** | Odd One Out / The Chameleon — Classic (imposter knows) or Sneaky (imposter gets a different word). Caught: everyone else +1. Escaped: imposter +2 | 3+ |
| **Hot Potato** | Catch Phrase + Pass the Bomb — Describe words or say words with letters, hidden fuse | 2+ |
| **Don't Say It** | Taboo — 4+ players play in teams, fewer play together | 2+ |
| **Majority Rules** | Herd Mentality — match the most popular answer for 1 point; first to 5 wins | 3+ |
| **Jinx** | Just One — everyone on one team, matching clues cancel out automatically; 8 cards | 3+ |
| **Spectrum** | Wavelength — one player sees the target and says a clue, then hands the phone to the team, who move the needle | 2+ |
| **Fishbowl** | Salad Bowl — same words, three rounds: describe, one word, sounds only | 2+ |
| **Doodle Chain** | Telestrations — draw, guess, draw the guess… | 2+ |
| **I Spy Bingo** | Spot things around you; card size follows the difficulty stars | any |
| **Guess the Wait** | Closest guess without going over wins; keeps running in the background | 1+ |

Every game opens with an animated how-to-play. Games hand out **tickets** to an all-day scoreboard.

## The word database

`data/words.json` holds everything the games draw from:

- 1,290 words in 15 categories and 47 groups, each tagged easy / medium / hard
- 340 Don't Say It cards with 4 banned words each
- 142 hand-written Majority Rules questions
- 114 hand-written Spectrum scales
- doodle parts that combine into about 192,000 different prompts
- 84 I Spy items, each with its own icon

`js/core/db.js` indexes it and generates fresh content each round. It remembers what you've seen recently, so words don't repeat until a deck runs out. Hot Potato builds its letter challenges from the letter patterns that are actually common in the database.

To add words, edit `data/words.json` (put them in `e`, `m` or `h` for difficulty) — you can do this right on github.com in the browser. Phones pick up the change by themselves the next time they open the app with signal (it shows the saved copy first, then refreshes it in the background).

## Developer mode (AI)

Tap the **Queue Crew** logo on the home screen 7 times to open the hidden developer menu.

1. Paste your [OpenRouter](https://openrouter.ai/keys) key. It is saved only on that phone and sent only to openrouter.ai. It is never in this code or on GitHub.
2. Pick a model. The default is Google's Gemini 3.8 Flash (fast and cheap). Search the box to pick any other OpenRouter model by name or id.
3. Turn on **Developer mode**.

While developer mode is on:

- Forehead's first card is **New deck**. Each tap has the AI invent a whole new themed deck, so the decks never run out.
- When any game is close to repeating its words, questions, scales or cards, the app quietly asks the AI for more in the background (one request at a time, at most once a minute per kind).
- **Make more now** writes a batch on demand.

Everything the AI writes is checked before it's used: right format, no repeats, plain letters only (no emoji), and a filter for words that aren't family-friendly. Turn developer mode off and the app goes back to the built-in word list only. **Remove AI** deletes everything the AI made.

## Tilt (Forehead)

The phone's motion sensor is turned into an "up" direction, so it works whether the phone is held sideways or upright, and with rotation lock on or off (the word is turned to face the watchers either way). On iPhone, Safari asks for motion permission the first time you tap **Ready**; this only works over `https://`. If there is no sensor, or permission is refused, tap the right half of the screen for "got it" and the left half for "skip".

## Testing on a computer (optional)

Phones never need this. To try changes on a computer before pushing, run `python3 tools/serve.py` and open http://localhost:8765.

## Icons

All icons are from [Tabler Icons](https://tabler.io/icons) (MIT License). `js/core/icons.js` contains only the ones the app uses, with the license notice. The app uses no emoji.

## Files

- `index.html`, `css/app.css`, `js/main.js` — app shell (home carousel, intros, players, tickets)
- `js/core/` — shared engine: UI helpers, icons, sound (synthesized, no audio files), timers, tilt, word database, text matching, tutorials, AI (`ai.js`)
- `js/dev.js` — the hidden developer menu
- `js/games/` — one file per game, each with its own animated tutorial
- `sw.js` — offline cache (saves what the app loads, refreshes it in the background)
- `tools/test-harness.js`, `tools/mock-ai.js` — drive the app (and fake the AI) from the browser console for testing
