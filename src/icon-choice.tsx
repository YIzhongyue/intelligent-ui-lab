import { useRef, useState } from 'react';
import { BookOpen, ChartColumn, CheckCircle, Clock, Code, Info, Lightbulb, ListChecks, OctagonAlert, ShieldCheck, Target, TriangleAlert } from 'lucide-react';
import type { ChoiceSpec, ComponentSpec } from './protocol';
import { choiceMessage, type ChoiceAction } from './choice';

const icons = { 'check-circle': CheckCircle, 'triangle-alert': TriangleAlert, 'octagon-alert': OctagonAlert, info: Info, lightbulb: Lightbulb, 'book-open': BookOpen, code: Code, target: Target, clock: Clock, 'list-checks': ListChecks, 'chart-column': ChartColumn, 'shield-check': ShieldCheck };
type Row = { title: string; body?: string; icon?: keyof typeof icons; color?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple' };
/** Shared, non-recursive presentation for sections and labeled choice options. */
export function IconRow({ row }: { row: Row }) {
  const Icon = row.icon ? icons[row.icon] : null;
  return <span className="ui-icon-row">{Icon && <Icon className={`ui-icon ui-icon-${row.color}`} size={23} strokeWidth={2} aria-hidden="true" focusable="false" />}<span className="ui-icon-copy"><strong>{row.title}</strong>{row.body && <span className="ui-icon-body">{row.body}</span>}</span></span>;
}
export function IconSections({ spec }: { spec: Extract<ComponentSpec, { kind: 'icon-sections' }> }) {
  return <ul className="ui-icon-sections">{spec.items.map((row, index) => <li key={index}><IconRow row={row} /></li>)}</ul>;
}
export function ChoiceGroup({ spec, instanceId, action }: { spec: ChoiceSpec; instanceId: string; action?: ChoiceAction }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const locked = useRef(false);
  const disabled = !action || action.disabled || submitted;
  const limit = spec.selection === 'single' ? 1 : spec.maxSelections ?? spec.options.length;
  const preview = choiceMessage(spec, selected);
  function submit() {
    if (disabled || locked.current || !preview || !action) return;
    locked.current = true;
    if (action.onSubmit(selected)) setSubmitted(true);
    else locked.current = false;
  }
  return <><fieldset className="ui-choices" disabled={disabled} aria-describedby={`${instanceId}-help`}><legend>{spec.selection === 'single' ? 'Choose one option' : `Choose up to ${limit} options`}</legend>{spec.options.map(option => <label className="ui-choice" key={option.id} htmlFor={`${instanceId}-${option.id}`}><input id={`${instanceId}-${option.id}`} name={instanceId} type={spec.selection === 'single' ? 'radio' : 'checkbox'} checked={selected.includes(option.id)} disabled={disabled || (spec.selection === 'multiple' && selected.length >= limit && !selected.includes(option.id))} onChange={event => setSelected(previous => spec.selection === 'single' ? [option.id] : event.target.checked ? [...previous, option.id] : previous.filter(id => id !== option.id))} /><IconRow row={option} /></label>)}</fieldset>
    <p className="ui-help" id={`${instanceId}-help`}>{submitted ? 'Choices sent. Continue in the next turn or retry that response if needed.' : action?.disabled ? action.reason : !action ? 'Read-only preview. Chat continuation is unavailable here.' : 'Selecting stays local. The button sends the exact message below and starts the next response using this answer’s settings.'}</p>
    {preview && <div className="ui-choice-preview"><strong>Message to send</strong><p>{preview}</p></div>}
    <button type="button" className="ui-choice-submit" disabled={disabled || !preview} onClick={submit}>{submitted ? 'Choices sent' : 'Send choices and continue'}</button>
  </>;
}
