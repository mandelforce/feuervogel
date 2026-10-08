# StarFall leaderboard setup (Cloudflare, free)

## Adding run reports (anonymous play data)
1. **Database:** in the D1 console, paste the `runs` part at the end of `schema.sql` (the `CREATE TABLE runs`
   and the two `CREATE INDEX` lines) and click **Execute**.
2. **Worker:** add the `/report` block from `worker.js` (it starts with `if (req.method === 'POST' && url.pathname === '/report')`)
   to the Worker, just above the final `return json({ error: 'not found' } ...)` line, and click **Deploy**.
3. **Game:** ship the new `index.html`. Until steps 1 and 2 are done, reports simply fail quietly.

Reading the data, for example in the D1 console:
```
SELECT diff, stage, end_kind, COUNT(*) FROM runs WHERE mode = 'camp' AND start = 1 GROUP BY diff, stage, end_kind;
SELECT json_extract(s.value, '$.s') AS stage, ROUND(AVG(json_extract(s.value, '$.b')), 1) AS boss_secs, COUNT(*) AS n
  FROM runs, json_each(runs.data, '$.st') AS s WHERE json_extract(s.value, '$.ok') = 1 GROUP BY stage;
```

## Updating to StarFall 1.0 (release)
Paste the new `worker.js` into the Worker (**Workers & Pages > starfall-scores > Edit code**, replace everything, **Deploy**).
It accepts scores from every version and shows all stored scores again. If you have not yet added the
`conts` and `start` columns from the 2.0 update below, do that first.

## Updating an existing leaderboard to StarFall 2.0
If your leaderboard already runs, you only need these three steps:
1. **Database:** in Cloudflare, open **Storage & Databases > D1 SQL Database > starfall > Console**,
   paste these two lines and click **Execute**:
   ```
   ALTER TABLE scores ADD COLUMN conts INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE scores ADD COLUMN start INTEGER NOT NULL DEFAULT 1;
   ```
2. **Worker:** open **Workers & Pages > starfall-scores > Edit code**, select everything in the editor,
   replace it with the contents of `worker.js` from this folder and click **Deploy**.
3. **Game:** upload the new `index.html` and `sw.js` to GitHub. The leaderboard address is already built in.

To remove old test scores, run for example: `DELETE FROM scores WHERE name = 'Test';`

## First-time setup

About 20 to 30 minutes, all in the browser. You don't need to install anything.

## 1. Create a Cloudflare account
Sign up for free at dash.cloudflare.com.

## 2. Create the database
1. In the left menu, open **Storage & Databases > D1 SQL Database**.
2. Click **Create**, name it `starfall`, and click **Create**.
3. Open the new database and go to the **Console** tab.
4. Open `schema.sql` from this folder, copy everything in it, paste it into the console and click **Execute**.
   You should now see a table called `scores`.

## 3. Create the Worker
1. In the left menu, open **Compute (Workers) > Workers & Pages**.
2. Click **Create**, then **Create Worker** (start from the Hello World example).
3. Name it `starfall-scores` and click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, then copy everything from `worker.js` in this folder and paste it in.
5. Click **Deploy**.

## 4. Connect the database to the Worker
1. Go back to the Worker's page and open **Settings > Bindings**.
2. Click **Add binding**, choose **D1 database**.
3. Variable name: `DB` (capital letters). Database: `starfall`.
4. Save. The Worker redeploys by itself.

## 5. Tell the game where the leaderboard is
1. On the Worker's page, copy its address. It looks like
   `https://starfall-scores.YOUR-NAME.workers.dev`
2. On GitHub, open `index.html` in your StarFall repository and click the pencil icon to edit it.
3. Near the top, find this line:
   `window.STARFALL_LEADERBOARD = '';`
   and paste the address between the quotes, for example:
   `window.STARFALL_LEADERBOARD = 'https://starfall-scores.YOUR-NAME.workers.dev';`
4. Click **Commit changes**.

After a minute or two, play a game. When it's over, StarFall asks for your name and sends the score.
The **SCORES** button on the title screen shows the top 10 for Campaign or Endless,
each difficulty, all-time or this week.

## Good to know
- **Only your site can send scores.** The Worker accepts scores only from
  `https://mandelforce.github.io`. If the game moves, edit `ALLOWED_ORIGINS` at the top of `worker.js`.
- **Checks:** names up to 12 characters (letters, numbers, spaces, dots, dashes, underscores), a short
  list of blocked words, plausible scores for the stage reached, a minimum play time,
  one score every 30 seconds per player and at most 40 a day.
- **Mobile and PC:** scores are kept on separate boards. The game decides by screen shape: the tall
  phone layout counts as Mobile, the classic wider layout as PC. Players can switch between both boards.
- **Players:** each device gets a random player ID, so two players with the same name stay separate.
  The list shows each player's best score once, with a short tag like `#3F2A` after the name.
- **Stars:** a star after a name means that player's best run used no continues.
- **Campaign rule:** Campaign scores only count for runs started at Stage 1. Practice runs from later stages are rejected.
- **Removing a score:** in the D1 console, run for example
  `DELETE FROM scores WHERE name = 'Cheater';`
- **Privacy:** only the name, score, stage, mode, difficulty, date and the random player ID are stored.
  Run reports (table `runs`) hold the random player ID and play data only: no names, no IP addresses.
  Players can switch them off in Settings → "Share play data".
- **Free tier:** far more than a hobby game needs, and it doesn't pause when quiet.
- The leaderboard only works on the GitHub version. Inside Claude, the game can't reach other sites.
