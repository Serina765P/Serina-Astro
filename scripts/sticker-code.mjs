/** 贴纸短代码与文件名共用同一套派生规则：保留字母、数字、`_`、`-`，其余折叠成 `_`。 */
export function stickerSlug(label) {
  return label.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
}

export function assertStickerCode(code) {
  if (!/^[a-z0-9]+_[\p{L}\p{N}_-]+$/u.test(code)) {
    throw new Error(`短代码格式无效：${code}（套装前缀请用小写字母和数字）`);
  }
}

export function stickerCode(set, label) {
  const code = `${set}_${stickerSlug(label)}`;
  assertStickerCode(code);
  return code;
}
