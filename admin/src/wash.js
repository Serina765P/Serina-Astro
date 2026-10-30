import { WASH_VALUES } from '../../src/lib/taxonomy.ts';

/** 管理后台两处（URI 对照、文章内联登记）共用的莫兰迪色板标签。 */
export const WASH_LABELS = {
  'var(--wash-pink)': '粉 · wash-pink',
  'var(--wash-mist)': '雾 · wash-mist',
  'var(--wash-sage)': '鼠尾草 · wash-sage',
  'var(--wash-sand)': '沙 · wash-sand',
  'var(--wash-clay)': '陶土 · wash-clay',
  'var(--wash-rose)': '玫瑰 · wash-rose',
};

export const WASH_OPTIONS = WASH_VALUES.map((value) => ({
  value,
  label: WASH_LABELS[value] ?? value,
}));

export const DEFAULT_WASH = WASH_VALUES[0];

export function nextWashColor(usedColors) {
  const taken = new Set(usedColors);
  return WASH_OPTIONS.find((option) => !taken.has(option.value))?.value ?? DEFAULT_WASH;
}
