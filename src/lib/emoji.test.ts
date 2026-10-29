import { describe, expect, it } from 'vitest';
import { EMOJI, renderShortcodeText, renderShuoshuoContent, splitEmojiText } from './emoji';
import { STICKER } from './sticker';

const emoji = EMOJI[0];
const sticker = STICKER[0];

describe('splitEmojiText', () => {
  it('把注册过的表情短代码切成分段', () => {
    const segments = splitEmojiText(`前 :${emoji.code}: 后`);

    expect(segments.map((segment) => segment.type)).toEqual(['text', 'shortcode', 'text']);
    const middle = segments[1];
    if (middle.type !== 'shortcode') throw new Error('expected shortcode segment');
    expect(middle.shortcode.code).toBe(emoji.code);
    expect(middle.shortcode.kind).toBe('emoji');
  });

  it('贴纸短代码同样展开，但类型不同', () => {
    const [segment] = splitEmojiText(`:${sticker.code}:`);

    if (segment.type !== 'shortcode') throw new Error('expected shortcode segment');
    expect(segment.shortcode.kind).toBe('sticker');
    expect(segment.shortcode.src).toBe(sticker.src);
  });

  it('未注册的短代码保持字面量', () => {
    const input = '看这个 :__missing__: 代码';
    expect(splitEmojiText(input)).toEqual([{ type: 'text', value: input }]);
  });

  it('链接地址里的冒号片段不展开', () => {
    const input = `https://example.test/:${emoji.code}:`;
    expect(splitEmojiText(input).some((segment) => segment.type === 'shortcode')).toBe(false);
  });
});

describe('renderShortcodeText', () => {
  it('转义用户文本', () => {
    expect(renderShortcodeText('<b>你好</b>')).toBe('&lt;b&gt;你好&lt;/b&gt;');
  });

  it('已注册短代码渲染成懒加载图片', () => {
    const html = renderShortcodeText(`:${emoji.code}:`);

    expect(html).toContain('class="custom-emoji"');
    expect(html).toContain(`alt=":${emoji.code}:"`);
    expect(html).toContain(`src="${emoji.src}"`);
    expect(html).toContain('loading="lazy"');
  });

  it('贴纸带自己的类名与数据属性', () => {
    const html = renderShortcodeText(`:${sticker.code}:`);

    expect(html).toContain('class="custom-sticker"');
    expect(html).toContain(`data-custom-sticker="${sticker.code}"`);
  });
});

describe('renderShuoshuoContent', () => {
  it('链接转成新窗口打开的外链并转义参数', () => {
    const html = renderShuoshuoContent('看 https://example.test/x?b=1&c=2 好');

    expect(html).toContain('href="https://example.test/x?b=1&amp;c=2"');
    expect(html).toContain('rel="noopener nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('正文里的短代码与纯文本一起渲染', () => {
    const html = renderShuoshuoContent(`好 :${emoji.code}: 看 <b>`);

    expect(html).toContain('class="custom-emoji"');
    expect(html).toContain('&lt;b&gt;');
  });
});
