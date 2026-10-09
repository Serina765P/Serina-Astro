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
    if (!segments.some((segment) => segment.type === 'emoji')) return;

    const replacement = segments.map((segment) =>
      segment.type === 'text'
        ? { type: 'text', value: segment.value }
        : {
            type: 'element',
            tagName: 'img',
            properties: {
              className: ['custom-emoji'],
              src: segment.emoji.src,
              alt: `:${segment.emoji.code}:`,
              title: segment.emoji.label,
              width: segment.emoji.width,
              height: segment.emoji.height,
              loading: 'lazy',
              decoding: 'async',
              draggable: false,
              dataCustomEmoji: segment.emoji.code,
            },
            children: [],
          },
    ) as HastNode[];
    context.replaceNode(node, replacement);
  },
};

export default emojiShortcodes;
