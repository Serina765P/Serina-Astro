import type { HastNode, HastPluginDefinition, HastVisitorContext } from 'satteri';
import { splitEmojiText } from './emoji';

/** Expand shortcodes in rendered text while preserving code, links, and HTML attributes. */
const emojiShortcodes: HastPluginDefinition = {
  name: 'serina-custom-emoji',
  text(node, context: HastVisitorContext) {
    let parent: HastNode | undefined = context.parent(node);
    while (parent) {
      if (parent.type === 'element' && (parent.tagName === 'code' || parent.tagName === 'pre'))
        return;
      parent = context.parent(parent);
    }

    const segments = splitEmojiText(node.value ?? '');
    if (!segments.some((segment) => segment.type === 'shortcode')) return;

    const replacement = segments.map((segment) => {
      if (segment.type === 'text') return { type: 'text', value: segment.value };
      const { shortcode } = segment;
      const sticker = shortcode.kind === 'sticker';
      return {
        type: 'element',
        tagName: 'img',
        properties: {
          className: [sticker ? 'custom-sticker' : 'custom-emoji'],
          src: shortcode.src,
          alt: `:${shortcode.code}:`,
          title: shortcode.label,
          width: shortcode.width,
          height: shortcode.height,
          loading: 'lazy',
          decoding: 'async',
          draggable: false,
          ...(sticker
            ? { dataCustomSticker: shortcode.code }
            : { dataCustomEmoji: shortcode.code }),
        },
        children: [],
      };
    }) as HastNode[];
    context.replaceNode(node, replacement);
  },
};

export default emojiShortcodes;
