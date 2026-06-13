// Cosmetic block/sky palettes unlocked with coins. Pure data — the STYLE FORMULA's "smooth
// pastel-to-vivid block spectrum" + "calm gradient sky" expressed as HSL functions. Perfect-stack
// flashes and coins keep the formula's single warm-gold signal hue across ALL themes (see GOLD).

export const GOLD = '#ffd34e';

const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

// Each theme:
//   sky(frac)   -> [topColor, bottomColor] for the vertical gradient (frac grows with height)
//   block(i)    -> color of the i-th stacked block (smoothly cycling spectrum)
//   label       -> { en, ru }
//   cost        -> coins to unlock (0 = free/default)
export const THEMES = [
  {
    id: 'spectrum', cost: 0, label: { en: 'Spectrum', ru: 'Спектр' },
    sky: (f) => [hsl(222 + f * 50, 42, 14 + f * 6), hsl(222 + f * 50, 48, 26 + f * 8)],
    block: (i) => hsl(200 + i * 9, 62, 58),
  },
  {
    id: 'sunset', cost: 150, label: { en: 'Sunset', ru: 'Закат' },
    sky: (f) => [hsl(268 - f * 40, 45, 16 + f * 6), hsl(20 - f * 10, 60, 34 + f * 6)],
    block: (i) => hsl(8 + i * 5, 72, 60),
  },
  {
    id: 'ocean', cost: 300, label: { en: 'Ocean', ru: 'Океан' },
    sky: (f) => [hsl(205, 50, 12 + f * 6), hsl(190, 55, 26 + f * 8)],
    block: (i) => hsl(186 + i * 4, 58, 56),
  },
  {
    id: 'candy', cost: 600, label: { en: 'Candy', ru: 'Карамель' },
    sky: (f) => [hsl(330, 35, 80 - f * 6), hsl(190, 45, 78 - f * 6)],
    block: (i) => hsl(330 + i * 11, 70, 72),
  },
  {
    id: 'mono', cost: 1000, label: { en: 'Mono', ru: 'Графит' },
    sky: (f) => [hsl(220, 8, 10 + f * 5), hsl(220, 8, 22 + f * 6)],
    block: (i) => hsl(220, 6, 40 + ((i * 7) % 45)),
  },
  {
    id: 'aurora', cost: 1500, label: { en: 'Aurora', ru: 'Сияние' },
    sky: (f) => [hsl(250, 45, 12 + f * 6), hsl(150, 50, 24 + f * 8)],
    block: (i) => hsl(150 + i * 13, 64, 60),
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
