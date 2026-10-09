import type { ChoiceSpec } from './protocol';

/** Rebuild from the stored spec, never trust child text, order, or hidden actions. */
export function choiceMessage(spec: ChoiceSpec, selectedIds: readonly string[]): string | null {
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !spec.options.some(option => option.id === id))) return null;
  const limit = spec.selection === 'single' ? 1 : spec.maxSelections ?? spec.options.length;
  if (selectedIds.length > limit) return null;
  const options = spec.options.filter(option => selectedIds.includes(option.id));
  const message = `For “${spec.title}”, I selected:\n${options.map(option => `- ${option.title}${option.body ? `: ${option.body}` : ''}`).join('\n')}\nPlease continue based on these choices.`;
  return message.length <= 4000 ? message : null;
}
export type ChoiceAction = { disabled: boolean; reason: string; onSubmit: (selectedIds: string[]) => boolean };
