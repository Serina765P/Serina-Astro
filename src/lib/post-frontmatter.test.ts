import { describe, expect, it } from 'vitest';
import { POST_FRONTMATTER_FIELDS, POST_LICENSES } from './post-frontmatter';

describe('post-frontmatter', () => {
  it('includes license in known editable frontmatter fields', () => {
    expect(POST_FRONTMATTER_FIELDS).toContain('license');
  });

  it('exports allowed license identifiers with original', () => {
    expect(POST_LICENSES).toEqual(['original']);
  });
});
