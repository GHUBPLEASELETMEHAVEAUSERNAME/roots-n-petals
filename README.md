# Fieldnotes / 04

A quadratic-function photo puzzle. Find each function’s zeros to release fragments of the supplied garden photograph, then reconstruct the image.

## Play modes and difficulty

- **Auto** places each released fragment in its original location, found using a secret code. (Justin's such a bebeh?)
- **Manual** asks players to drag a released fragment onto the board, or select it and then select an empty space. A small number records the order in which the fragment was solved; it does not reveal its destination.
- Harder and Impossible always use Manual mode.
- Easy uses a 4 × 3 board (12 tiles), Medium 4 × 4 (16), Hard 8 × 4 (32), Harder 8 × 8 (64), and Impossible 16 × 8 (128).
- Each run draws a proportional mix of imaginary, distinct-real, and repeated-root functions in a 2:4:6 ratio. Counts below follow that same order: Easy 2/4/6, Medium 3/5/8, Hard 5/11/16, Harder 11/21/32, and Impossible 21/43/64. Questions are unique within each run and shuffled together.
- A new study randomly chooses from seven included garden photos. Players can choose a JPEG, PNG, or WebP photo from their device instead; the browser resizes it locally and keeps it with that puzzle’s tab session. Custom images are never sent to the server.
- Progress is held in the current tab session. The browser asks before leaving an unfinished puzzle; closing the tab discards that session.

## Run locally

1. Install Node.js, then open PowerShell in the project folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env`. Set the server-side phrase variables in that file: `AUTHOR_KEY_CODE`, `AUTO_MODE_CODE`, `PUZZLE_COMPLETE_CODE`, `QUESTION_SOLVE_CODE`, `CODE_LIST_CODE`, `PUZZLE_RESTART_CODE`, and `SCREEN_EFFECT_CODE`. `SCREEN_EFFECT_TEXT` controls the words shown by the screen effect. Keep `.env` private; it is ignored by Git.
4. Run `npm run dev` and open the localhost URL shown in the terminal.

The answer key remains in the ignored `server/answerKey.private.json` file. Local Vite API routes use that file for answer checking and only return it when the server validates the maker phrase. The maker phrase can be typed into any function-answer box; it has no visible link in the interface. The accepted alternate form is the reversed flower-name pair. A separate server-checked code unlocks Auto mode for the current browser tab. These are playful shared-project easter eggs, not account authentication.

The code-list easter egg includes the maker phrase and its accepted alternate, as requested. Anyone who discovers the code-list phrase can therefore access the answer key.

## Publish after approval

Publishing is intentionally a separate step from local implementation. Once the UI is approved, create a **private** GitHub repository and import it into Vercel. Keep `server/answerKey.private.json` and `.env` out of Git. In Vercel project settings, set `AUTHOR_KEY_CODE`, `AUTO_MODE_CODE`, `PUZZLE_COMPLETE_CODE`, `QUESTION_SOLVE_CODE`, `CODE_LIST_CODE`, `PUZZLE_RESTART_CODE`, `SCREEN_EFFECT_CODE`, `SCREEN_EFFECT_TEXT`, and `ANSWER_KEY_JSON` for the environments that need them, then deploy. `ANSWER_KEY_JSON` should contain the contents of the private answer file. Redeploy after changing environment variables.

## Project structure

- `src/ui/App.tsx` — home, play, completion, function, and help screens plus puzzle state.
- `src/ui/styles.css` — responsive field-journal visual system and layout.
- `src/data/questions.json` — public bank of 184 quadratic functions.
- `public/study-images/` — six additional garden photos in the random image pool.
- `api/` — Vercel serverless endpoints.
- `server/logic.ts` — private answer validation and author key access.
- `server/answerKey.private.json` — ignored solution data; never move it into `src/` or `public/`.
- `public/flower-puzzle.png` — supplied photo used by the puzzle.
