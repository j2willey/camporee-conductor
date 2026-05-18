# Dev Notes

## Removed for production: Judge "Reset Local Data" button

Removed 2026-05-16 before pilot event.

The `resetAppData()` function still exists in `public/js/judge.js` (~line 92).
To restore it, add this block back to the Judge Profile panel in `public/judge.html`
(just before the closing `</div>` of the profile drawer):

```html
<div class="border-top pt-3 mt-2 text-center">
    <p class="text-danger small fw-bold mb-2">Troubleshooting</p>
    <button class="btn btn-outline-danger btn-sm w-100" onclick="app.resetAppData()">⚠️ Reset Local Data & Reload</button>
</div>
```

---

## Event-day fixes (2026-05-16/17, Coyote Creek Camporee)

### Troop number T-prefix normalization
All JS files (`admin.js`, `judge.js`, `official.js`, `utils.js`) now strip a leading `T` from
`troop_number` before display, sort, and label construction. Troops entered as `T2110` or `2110`
both render as `T2110`. The `parseInt` sort comparisons all use `.replace(/^T/i, '')` to avoid
NaN caused by the leading letter.

### `updateScoreField` was missing
`official.js` called `updateScoreField(uuid, field, value)` in three places (manual rank, manual
points, admin field edits) but the function was never defined — all inline edits silently failed.
Implemented: reads current `score_payload` from `appData.scores`, patches the field, PUTs the full
payload to `PUT /api/scores/:uuid`.

### Time column sort
The detail table sort fell through to `parseFloat("1:23") === 1` for all times in the same minute.
Added `MM:SS` / `H:MM:SS` detection with a `toSec()` converter before the numeric fallback.

### official.html navigation back — blank screen
`popstate` handler fell back to `switchView('dashboard')` when no history state existed (initial
page load doesn't push state). `switchView('dashboard')` has no matching case in `official.js`
so all sections were hidden. Fixed fallback to `switchView('overview')`. Also added a "← Games"
button (`header-back-btn`) to the header that appears when drilling into a game detail.

### collator.js req.baseUrl fallback
`req.baseUrl` is `''` (empty string) inside the collator sub-app when mounted via ESM dynamic
import. All redirects now use `(req.baseUrl || '/collator')`.

---

## Awards printing architecture (utils.html)

### Sticker layout
- `renderStickers()` builds a `<table>` with one `<tbody>` per row of 3 stickers.
- Each `<tbody>` has `break-inside: avoid` so a row of stickers never splits across a print page.
- Spacer rows (in their own `<tbody>`) separate award groups.
- Patrol/Troop toggle switches `currentViewMode`; sticker preview is cleared on toggle.

### Troop overall flat award ("Top Dog / Best in Show")
- Controlled by `#troop-overall-name`, `#troop-overall-award`, `#troop-overall-pct` fields.
- Shown only when Troop Challenges mode is active.
- Awards the top N% of troops by total leaderboard points — all recipients get identical award text
  (no 1st/2nd/3rd differentiation).

### Announcer Sheet
- `renderAnnouncerSheet()` computes full per-game rankings (top 3 places + ties) from raw scores.
- Each game is an `.announcer-block` div with `break-inside: avoid`.
- Sticker and announcer print paths are mutually exclusive: each temporarily suppresses the other
  container's `print-only` class before calling `window.print()`.
