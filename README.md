# StarFall

A WW2-themed vertical arcade shooter. Six stages, six bosses, Campaign, Generative and Endless modes.

## Publish on GitHub Pages

1. Create a free account at github.com.
2. Click **New repository**, name it `starfall` and set it to **Public**.
3. Choose **Add file > Upload files** and drag in everything from this folder:
   `index.html`, `manifest.json`, `sw.js`, `README.md` and the `icons` folder.
   Click **Commit changes**.
4. Go to **Settings > Pages**. Under "Build and deployment" choose **Deploy from a branch**,
   select **main** and **/ (root)**, then **Save**.
5. After a minute or two the game is live at `https://YOUR-USERNAME.github.io/starfall/`.

## Install on a phone

- **iPhone:** open the link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap the menu, then **Install app** or **Add to Home screen**.

The game then opens full screen from its own icon and works offline after the first visit.

## Updating the game

1. Replace `index.html` with the new version (keep the lines in its header that link
   `manifest.json` and the icons, and the small script at the end that registers `sw.js`).
2. Open `sw.js` and change `VERSION` (for example to `starfall-1.6`).
3. Upload both files. Players get the update the next time they open the game online.

## Notes

- Scores, secrets and settings are saved on each device, separately for each website.
- The menus use the Pixelify Sans font from Google Fonts. It is downloaded on the first
  visit and then kept for offline play. The game's own text uses a built-in pixel font.
