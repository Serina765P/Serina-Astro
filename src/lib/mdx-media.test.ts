import { describe, expect, it } from 'vitest';
import { hasMediaImport, mediaSnippet, planMediaInsertion } from './mdx-media';

const BVID = 'BV1aYxg6DEXb';

describe('mediaSnippet', () => {
  it('builds a playlist player with its import', () => {
    const snippet = mediaSnippet({ kind: 'music' });
    expect(snippet.tag).toBe('<ArticleMusicPlayer />');
    expect(snippet.importLine).toBe(
      "import ArticleMusicPlayer from '../../components/music/ArticleMusicPlayer.astro';",
    );
  });

  it('builds a single-track player', () => {
    const snippet = mediaSnippet({ kind: 'music', track: '548650102' });
    expect(snippet.tag).toBe('<ArticleMusicPlayer track="548650102" />');
  });

  it('rejects a non-numeric track id', () => {
    expect(() => mediaSnippet({ kind: 'music', track: 'abc' })).toThrow(/track/i);
  });

  it('rejects a track id that is not in the playlist snapshot', () => {
    expect(() => mediaSnippet({ kind: 'music', track: '123456' })).toThrow(/快照/);
  });

  it('omits p for the first page and includes it for later pages', () => {
    expect(mediaSnippet({ kind: 'bilibili', bvid: BVID }).tag).toBe(
      `<BilibiliPlayer bvid="${BVID}" />`,
    );
    expect(mediaSnippet({ kind: 'bilibili', bvid: BVID, p: 3 }).tag).toBe(
      `<BilibiliPlayer bvid="${BVID}" p={3} />`,
    );
    expect(mediaSnippet({ kind: 'bilibili', bvid: BVID, p: '3' }).tag).toBe(
      `<BilibiliPlayer bvid="${BVID}" p={3} />`,
    );
  });

  it('keeps a plain title as a quoted attribute', () => {
    expect(mediaSnippet({ kind: 'bilibili', bvid: BVID, title: '  演唱会切片  ' }).tag).toBe(
      `<BilibiliPlayer bvid="${BVID}" title="演唱会切片" />`,
    );
  });

  it('escapes titles with character references so MDX and the preview both parse it', () => {
    const tag = mediaSnippet({ kind: 'bilibili', bvid: BVID, title: '他说"走"\\吧' }).tag;
    expect(tag).toBe(`<BilibiliPlayer bvid="${BVID}" title="他说&quot;走&quot;&#92;吧" />`);
  });

  it('passes an optional cover into the tag', () => {
    expect(
      mediaSnippet({
        kind: 'bilibili',
        bvid: BVID,
        cover: 'https://i0.hdslb.com/bfs/archive/x.jpg',
      }).tag,
    ).toBe(`<BilibiliPlayer bvid="${BVID}" cover="https://i0.hdslb.com/bfs/archive/x.jpg" />`);
  });

  it('rejects an unsafe cover', () => {
    expect(() =>
      mediaSnippet({ kind: 'bilibili', bvid: BVID, cover: 'javascript:alert(1)' }),
    ).toThrow(/cover/i);
  });

  it('rejects invalid bv ids', () => {
    expect(() => mediaSnippet({ kind: 'bilibili', bvid: 'BV123' })).toThrow(/bvid/i);
  });
});

describe('hasMediaImport', () => {
  const playlist = mediaSnippet({ kind: 'music' });

  it('detects an existing import with another quote style or without a semicolon', () => {
    const body = `import ArticleMusicPlayer from "../../components/music/ArticleMusicPlayer.astro"\n\n正文`;
    expect(hasMediaImport(body, playlist)).toBe(true);
  });

  it('does not treat a different binding as the import', () => {
    const body = `import Playlist from '../../components/music/ArticleMusicPlayer.astro';\n\n正文`;
    expect(hasMediaImport(body, playlist)).toBe(false);
  });

  it('matches imports on their own line only', () => {
    const body = `> import ArticleMusicPlayer from '../../components/music/ArticleMusicPlayer.astro';`;
    expect(hasMediaImport(body, playlist)).toBe(false);
  });
});

describe('planMediaInsertion', () => {
  const bilibili = mediaSnippet({ kind: 'bilibili', bvid: BVID });

  it('adds the import and tag to an empty document', () => {
    const plan = planMediaInsertion('', 0, 0, bilibili);
    const text = plan.changes.map((change) => change.insert).join('');
    expect(text).toBe(`${bilibili.importLine}\n\n${bilibili.tag}`);
    expect(plan.anchor).toBe(text.length);
  });

  it('isolates the tag from surrounding paragraph text', () => {
    const doc = `${bilibili.importLine}\n\n正文第一行\n正文第二行\n`;
    const from = doc.indexOf('第一行') + '第一行'.length;
    const plan = planMediaInsertion(doc, from, from, bilibili);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].insert).toBe(`\n\n${bilibili.tag}\n`);
    expect(plan.anchor).toBe(from + 2 + bilibili.tag.length);
  });

  it('wraps an inline cursor with blank lines on both sides', () => {
    const doc = `${bilibili.importLine}\n\n前文 后文\n`;
    const from = doc.indexOf(' 后文') + 1;
    const plan = planMediaInsertion(doc, from, from, bilibili);
    expect(plan.changes[0].insert).toBe(`\n\n${bilibili.tag}\n\n`);
    expect(plan.anchor).toBe(from + 2 + bilibili.tag.length);
  });

  it('uses an existing empty line without adding more blank lines', () => {
    const doc = `${bilibili.importLine}\n\n第一段\n\n第二段\n`;
    const from = doc.indexOf('第二段');
    const plan = planMediaInsertion(doc, from, from, bilibili);
    expect(plan.changes[0].insert).toBe(`${bilibili.tag}\n\n`);
    expect(plan.anchor).toBe(from + bilibili.tag.length);
  });

  it('inserts the import at the top while keeping the cursor on the tag', () => {
    const doc = '正文\n';
    const from = 2;
    const plan = planMediaInsertion(doc, from, from, bilibili);
    expect(plan.changes).toEqual([
      { from: 0, to: 0, insert: `${bilibili.importLine}\n\n` },
      { from, to: from, insert: `\n\n${bilibili.tag}` },
    ]);
    expect(plan.anchor).toBe(from + `${bilibili.importLine}\n\n`.length + 2 + bilibili.tag.length);
  });

  it('keeps the tag below an existing import block when the cursor is at the start', () => {
    const doc = `${bilibili.importLine}\n\n<ArticleMusicPlayer />\n`;
    const at = `${bilibili.importLine}\n\n`.length;
    const plan = planMediaInsertion(doc, 0, 0, bilibili);
    expect(plan.changes).toEqual([{ from: at, to: at, insert: `${bilibili.tag}\n\n` }]);
    expect(plan.anchor).toBe(at + bilibili.tag.length);
  });

  it('keeps the import when the selection removes it', () => {
    const doc = `${bilibili.importLine}\n\n正文\n`;
    const plan = planMediaInsertion(doc, 0, bilibili.importLine.length, bilibili);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].insert.startsWith(`${bilibili.importLine}\n\n`)).toBe(true);
  });

  it('replaces the current selection with the tag', () => {
    const doc = `${bilibili.importLine}\n\n[占位]\n`;
    const from = doc.indexOf('[占位]');
    const to = from + '[占位]'.length;
    const plan = planMediaInsertion(doc, from, to, bilibili);
    expect(plan.changes[0]).toMatchObject({ from, to, insert: bilibili.tag });
    expect(plan.anchor).toBe(from + bilibili.tag.length);
  });
});
