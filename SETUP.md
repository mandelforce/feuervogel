# StarFall leaderboard setup (Cloudflare, free)

## Deploying the Worker (automatic)

The leaderboard Worker is deployed from this repository, not by pasting code into the Cloudflare dashboard. Pasting by hand lets the
live Worker drift away from `worker.js` (it already did once: the live Worker currently has no `/status`).

How it works: a pull request that changes `worker.js` or `wrangler.toml` runs the Worker tests and checks the deploy configuration.
After the merge to `main`, GitHub waits for **your approval** (a button on the workflow run), then deploys to Cloudflare and checks that
the live Worker answers. Cloudflare keeps every version, so a bad deploy can be undone from **Workers & Pages > (the Worker) >
Deployments** (roll back to the earlier version) or by reverting the pull request.

**One-time setup (about 10 minutes):**
1. **GitHub environment first:** in the repository open **Settings > Environments > New environment**, name it `production-worker`,
   tick **Required reviewers** and add yourself, then save. (Do this before the secrets, so the first deploy cannot run unattended.)
2. **Cloudflare API token:** open **dash.cloudflare.com > My Profile > API Tokens > Create Token > Create Custom Token**.
   Permissions: **Account > Workers Scripts > Edit** and **Account > Account Settings > Read**. Account resources: only your account.
   Create it and copy the token once. If the first deploy reports a missing permission, add the one it names.
3. **Add two secrets to that environment** (the environment page, **Environment secrets**):
   `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the long ID in the dashboard address after `dash.cloudflare.com/`).
   Never paste the token into a chat or a file in this repository.
4. Merge the pull request that added this setup. Approve the deploy when GitHub asks.

**Worker names.** The Worker is called `feuervogel` (`https://feuervogel.c-roth79.workers.dev`). The original `starfall-scores` is deployed
from the same code and talks to the same database, so scores are the same on both. Game versions released before the rename still call
`starfall-scores`, so it stays until those are gone (check **Workers & Pages > starfall-scores > Metrics**: when requests stop, remove
`starfall-scores` from the list in `.github/workflows/deploy-worker.yml` and delete it in the dashboard).

**Day to day:** change `worker.js`, open a pull request, check the tests, merge, approve the deploy.
**Database changes** (new tables or columns in `schema.sql`) are not part of the deploy: run them once in the D1 console
(**Storage & Databases > D1 > starfall > Console**) before merging the Worker change that needs them.

## Adding run reports (anonymous play data)
1. **Database:** in the D1 console, paste the `runs` part at the end of `schema.sql` (the `CREATE TABLE runs`
   and the two `CREATE INDEX` lines) and click **Execute**.
2. **Worker:** merge the change; it is deployed as described above. (Do not paste code into the dashboard editor.)
3. **Game:** ship the new `index.html`. Until steps 1 and 2 are done, reports simply fail quietly.

Reading the data, for example in the D1 console:
```
SELECT diff, stage, end_kind, COUNT(*) FROM runs WHERE mode = 'camp' AND start = 1 GROUP BY diff, stage, end_kind;
SELECT json_extract(s.value, '$.s') AS stage, ROUND(AVG(json_extract(s.value, '$.b')), 1) AS boss_secs, COUNT(*) AS n
  FROM runs, json_each(runs.data, '$.st') AS s WHERE json_extract(s.value, '$.ok') = 1 GROUP BY stage;
```

## Updating to StarFall 1.0 (release)
Deploy the new `worker.js` as described under "Deploying the Worker (automatic)".
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
2. **Worker:** deploy `worker.js` as described under "Deploying the Worker (automatic)".
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
(First-time only. After this, deploy changes through the repository, see "Deploying the Worker (automatic)".)
1. In the left menu, open **Compute (Workers) > Workers & Pages**.
2. Click **Create**, then **Create Worker** (start from the Hello World example).
3. Name it `feuervogel` and click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, then copy everything from `worker.js` in this folder and paste it in.
5. Click **Deploy**.

## 4. Connect the database to the Worker
1. Go back to the Worker's page and open **Settings > Bindings**.
2. Click **Add binding**, choose **D1 database**.
3. Variable name: `DB` (capital letters). Database: `starfall`.
4. Save. The Worker redeploys by itself.

## 5. Tell the game where the leaderboard is
1. On the Worker's page, copy its address. It looks like
   `https://feuervogel.YOUR-NAME.workers.dev`
2. On GitHub, open `index.html` in your StarFall repository and click the pencil icon to edit it.
3. Near the top, find this line:
   `window.STARFALL_LEADERBOARD = '';`
   and paste the address between the quotes, for example:
   `window.STARFALL_LEADERBOARD = 'https://feuervogel.YOUR-NAME.workers.dev';`
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
