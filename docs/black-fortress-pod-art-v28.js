// Black Fortress lance pods, the first loop's level 6 (build 1.2.5.99): the two pods under the wing tips that fire the twin lance. Two pictures baked into the Enigma art set: 'bPod' (13 x 20, the
// unfolded pod, its three coil rings and its lens left dark: the game lights them itself, red when idle, cyan while charging, white while firing, at the pixels POD_RING and POD_LENS list)
// and 'bPodF' (13 x 7, the folded hatch it lies in until the last act). Design A of the owner's mockups (coil nacelle). Run it inside the game (a local build: __sf(code)); it returns
// { P, F: data URLs, dims, ring, lens: the lit pixels as [x, y] lists for the game's constants }.
(() => {
const W = 13;
const PAL = { o: '#120e1a', d: '#22252c', s: '#323640', l: '#474c58', r: '#7a1414', g: '#26323a', L: '#2c1618', w: '#4a2428' };
const rows = ['ooooo', 'odsssdo', 'oslllso', 'odsssdo', 'oodrrrdoo', 'odsssssdo', 'osgggggso', 'odsssssdo', 'osgggggso', 'odsssssdo', 'osgggggso', 'oodsssdoo', 'odsssssdo', 'oddddddo', 'oodLLLdoo', 'odLLLLLdo', 'oLLwLLLo', 'oLLLLLo', 'oLLLo', 'ooo'];
const grid = rows.map(r => { const pad = W - r.length, a = pad >> 1; return '.'.repeat(a) + r + '.'.repeat(pad - a); });
const ring = [], lens = [];
const P = sprite(W, grid.length, x => { grid.forEach((r, y) => { for (let i = 0; i < W; i++) { const ch = r[i]; if (ch === '.') continue; if (ch === 'g') ring.push([i, y]); if (ch === 'L' || ch === 'w') lens.push([i, y]); rect(x, PAL[ch], i, y, 1, 1); } }); }, { outline: false });
const frows = ['..ooooooooo..', '.odsssssssdo.', 'odsslllsssddo', 'osdooooooodso', 'odsssssssssdo', '.oodddddddoo.', '...ooooooo...'];
const F = sprite(W, frows.length, x => { frows.forEach((r, y) => { for (let i = 0; i < W; i++) if (r[i] !== '.') rect(x, PAL[r[i]], i, y, 1, 1); }); }, { outline: false });
return { P: P.c.toDataURL(), F: F.c.toDataURL(), dims: [P.c.width, P.c.height, F.c.width, F.c.height], ring: JSON.stringify(ring), lens: JSON.stringify(lens) };
})()
