import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { componentSchema, choiceSchema, iconNames, iconColors } from './protocol';
import { choiceMessage } from './choice';
import { UIRenderer } from './components';
const valid = { kind: 'choice-group', id: 'choose', title: 'Study topic', selection: 'multiple', options: [{ id: 'a', title: 'Theory' }, { id: 'b', title: 'Practice', body: 'Build an example', icon: 'code', color: 'blue' }] };
describe('icon and choice contracts', () => {
  it('allows all named icons and colors, escaping plain text', () => {
    for (const icon of iconNames) for (const color of iconColors) {
      const spec = componentSchema.parse({ kind: 'icon-sections', id: 'sections', title: 'Notes', items: [{ title: '<script>title</script>', body: '<img src=x>', icon, color }] });
      const html = renderToStaticMarkup(createElement(UIRenderer, { spec }));
      expect(html).toContain(`ui-icon-${color}`); expect(html).toContain('<svg'); expect(html).not.toMatch(/<script|<img/);
    }
  });
  it('rejects unbounded values, duplicate IDs, mismatched icon/color and hidden actions', () => {
    for (const patch of [{ options: [valid.options[0], valid.options[0]] }, { maxSelections: 3 }, { selection: 'single', maxSelections: 2 }, { maxSelections: Infinity }, { action: 'send' }, { options: [{ ...valid.options[0], icon: 'code' }, valid.options[1]] }, { options: [{ ...valid.options[0], color: 'red' }, valid.options[1]] }, { options: [{ ...valid.options[0], icon: 'unknown', color: 'blue' }, valid.options[1]] }, { options: [{ ...valid.options[0], icon: 'code', color: '#fff' }, valid.options[1]] }]) expect(choiceSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it('rebuilds stable declaration-order messages and rejects invalid selections', () => {
    const spec = choiceSchema.parse(valid);
    expect(choiceMessage(spec, ['b', 'a'])).toBe('For “Study topic”, I selected:\n- Theory\n- Practice: Build an example\nPlease continue based on these choices.');
    for (const ids of [[], ['missing'], ['a', 'a']]) expect(choiceMessage(spec, ids)).toBeNull();
    expect(choiceMessage(choiceSchema.parse({ ...valid, selection: 'single' }), ['a', 'b'])).toBeNull();
    expect(choiceMessage(choiceSchema.parse({ ...valid, maxSelections: 1 }), ['a', 'b'])).toBeNull();
  });
  it('fits every permitted selected label and body without truncation', () => {
    const spec = choiceSchema.parse({ ...valid, title: 't'.repeat(120), options: Array.from({ length: 8 }, (_, i) => ({ id: `option-${i}`, title: 'x'.repeat(120), body: 'y'.repeat(240) })) });
    const message = choiceMessage(spec, spec.options.map(option => option.id))!;
    expect(message.length).toBeLessThanOrEqual(4000); expect(message.match(/y/g)).toHaveLength(8 * 240);
  });
});
