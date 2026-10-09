import { useId, useState } from 'react';
import { partitionRows, type ComponentSpec } from './protocol';
import './components.css';

function Skew({ spec, instanceId }: { instanceId: string; spec: Extract<ComponentSpec, { kind: 'skew' }> }) {
  const [hot, setHot] = useState(spec.hotPercent);
  const counts = partitionRows(spec.rows, spec.partitions, hot);
  const max = Math.max(...counts);
  return <section className="card simulator" aria-labelledby={instanceId + '-title'}>
    <div className="card-heading"><h2 id={instanceId + '-title'}>{spec.title}</h2><span className="tag">LOCAL SIMULATION</span></div>
    <div className="metrics"><div><strong>{spec.rows.toLocaleString()}</strong><span>Total rows</span></div><div><strong>{spec.partitions}</strong><span>Partitions</span></div><div><strong>{(max / (spec.rows / spec.partitions)).toFixed(2)}×</strong><span>Max / average</span></div></div>
    <div className="chart" aria-label="Rows per partition">
      {counts.map((count, i) => <div className="bar-column" key={i}><span className="bar-value">{count.toLocaleString()}</span><div className={'bar ' + (i === 0 ? 'hot' : '')} style={{ height: `${Math.max(4, count / max * 140)}px` }} /><span>P{i + 1}</span></div>)}
    </div>
    <label className="slider-label" htmlFor={instanceId + '-slider'}>Hot-key share <output>{hot}%</output></label>
    <input id={instanceId + '-slider'} type="range" min="0" max="90" step="1" value={hot} onChange={event => setHot(Number(event.target.value))} />
    <div className="range-labels"><span>Evenly distributed</span><span>Highly concentrated</span></div>
    <button type="button" className="secondary" onClick={() => setHot(spec.hotPercent)}>Reset simulation</button>
  </section>;
}

function Checklist({ spec, instanceId }: { spec: Extract<ComponentSpec, { kind: 'checklist' }>; instanceId: string }) {
  const [checked, setChecked] = useState(() => spec.items.map(item => item.checked));
  return <><p className="ui-help">Local checklist · changes are not saved or sent.</p><ul className="ui-checklist">{spec.items.map((item, index) => <li key={index}><label htmlFor={`${instanceId}-check-${index}`}><input id={`${instanceId}-check-${index}`} type="checkbox" checked={checked[index]} onChange={event => setChecked(previous => previous.map((value, i) => i === index ? event.target.checked : value))} /><span>{item.label}</span></label></li>)}</ul><button type="button" className="secondary" onClick={() => setChecked(spec.items.map(item => item.checked))}>Reset checklist</button></>;
}

/** Accept only validated specs. Remount with a new key for a new response/spec. */
export function UIRenderer({ spec, idPrefix = 'ui' }: { spec: ComponentSpec; idPrefix?: string }) {
  // React's instance ID prevents collisions even when answers reuse component IDs.
  const instanceId = `${idPrefix}-${useId()}-${spec.id}`;
  if (spec.kind === 'skew') return <Skew spec={spec} instanceId={instanceId} />;
  if (spec.kind === 'notice') return <aside className="notice ui-component" aria-labelledby={`${instanceId}-title`}><strong id={`${instanceId}-title`}>{spec.title}</strong><p>{spec.body}</p></aside>;
  return <section className="card ui-component" aria-labelledby={`${instanceId}-title`}><h2 id={`${instanceId}-title`}>{spec.title}</h2>{renderContent(spec, instanceId)}</section>;
}

function renderContent(spec: Exclude<ComponentSpec, { kind: 'skew' | 'notice' }>, instanceId: string) {
  switch (spec.kind) {
    case 'text': return <p>{spec.body}</p>;
    case 'metrics': return <dl className="ui-metrics">{spec.items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd>{item.detail && <dd className="ui-detail">{item.detail}</dd>}</div>)}</dl>;
    case 'table': return <div className="ui-table-scroll" role="region" aria-label={`${spec.title} table`} tabIndex={0}><table><caption>{spec.title}</caption><thead><tr>{spec.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead><tbody>{spec.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table></div>;
    case 'bar-chart': {
      const max = Math.max(1, ...spec.items.map(item => item.value));
      return <><p className="ui-help">{spec.unit ? `Values in ${spec.unit}` : 'Values'} · bars scaled to the largest value</p><ul className="ui-bars">{spec.items.map((item, index) => <li key={index}><div><span>{item.label}</span><strong>{item.value.toLocaleString('en-US')}{spec.unit && ` ${spec.unit}`}</strong></div><div className="ui-bar-track" aria-hidden="true"><span style={{ width: `${item.value / max * 100}%` }} /></div></li>)}</ul></>;
    }
    case 'checklist': return <Checklist spec={spec} instanceId={instanceId} />;
    case 'disclosure': return <div className="ui-disclosures">{spec.items.map((item, index) => <details key={index}><summary>{item.summary}</summary><p>{item.body}</p></details>)}</div>;
    case 'comparison': return <div className="ui-comparison">{spec.items.map((item, index) => <article key={index}><h3>{item.name}</h3><p>{item.summary}</p><h4>Advantages</h4>{item.advantages.length ? <ul>{item.advantages.map((value, i) => <li key={i}>{value}</li>)}</ul> : <p>None listed</p>}<h4>Limitations</h4>{item.limitations.length ? <ul>{item.limitations.map((value, i) => <li key={i}>{value}</li>)}</ul> : <p>None listed</p>}</article>)}</div>;
    default: { const unreachable: never = spec; return unreachable; }
  }
}
