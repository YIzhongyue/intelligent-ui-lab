import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EventDecoder, publicSchema, type ComponentSpec, type UIEvent } from './protocol';
import { mockProvider, type Scenario } from './provider';
import './style.css';
import { UIRenderer } from './components';

function App() {
  const [scenario, setScenario] = useState<Scenario>('skew');
  const [specs, setSpecs] = useState<ComponentSpec[]>([]);
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function cancel() {
    active.current?.abort(); active.current = null;
    setRunning(false); setStatus('Cancelled · partial preview retained');
  }
  async function run() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setRunId(id => id + 1); setSpecs([]); setEvents([]); setError(''); setRunning(true); setStatus('Streaming');
    const decoder = new EventDecoder();
    const ids = new Set<string>();
    const accept = (batch: UIEvent[]) => {
      if (active.current !== controller || controller.signal.aborted) return;
      for (const event of batch) {
        if (event.type === 'component') {
          if (ids.has(event.component.id)) throw new Error('Duplicate component ID rejected.');
          ids.add(event.component.id);
          setSpecs(previous => [...previous, event.component]);
        }
        setEvents(previous => [...previous, event]);
      }
    };
    try {
      for await (const chunk of mockProvider.stream(scenario, controller.signal)) accept(decoder.push(chunk));
      accept(decoder.finish());
      if (active.current === controller) setStatus('Complete');
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Unknown stream error.'); setStatus('Rejected');
      }
    } finally {
      if (active.current === controller) { active.current = null; setRunning(false); }
    }
  }
  return <div className="app">
    <header><a className="wordmark" href="./">◈ <span>Intelligent UI <b>Lab</b></span></a><span className="version">EXPERIMENT 001</span></header>
    <main><div className="eyebrow">FROM ANSWER TO INTERFACE</div><h1>The right shape<br />for an explanation.</h1><p className="intro">A small playground for validated, streaming interfaces.<br />Plain text when it is enough. Interactive components when they help.</p>
      <div className="workspace"><aside className="controls"><h2>Choose an experiment</h2><label htmlFor="scenario">Response scenario</label><select id="scenario" value={scenario} onChange={event => { if (running) cancel(); setScenario(event.target.value as Scenario); }}><option value="skew">Explore data skew</option><option value="text">A simple definition</option><option value="invalid">Reject an unsafe component</option></select><p className="small">Changing the scenario stops an active stream. Run to start a fresh response.</p><button onClick={run}>{running ? 'Restart response' : 'Run response'} <span aria-hidden="true">↗</span></button><button className="secondary" disabled={!running} onClick={cancel}>Cancel stream</button><div className="provider"><span className="dot" />{mockProvider.label}</div><p className="small">Only allowlisted components can render. Controls update local state; generated content cannot execute code.</p><details><summary>Inspect event schema</summary><pre>{JSON.stringify(publicSchema, null, 2)}</pre></details></aside>
      <section className="preview" aria-label="Response preview"><div className="preview-heading"><span>RESPONSE CANVAS</span><span role="status" className={running ? 'status live' : 'status'}>{status}</span></div>{error && <div role="alert" className="error">{error} No unsupported component was rendered.</div>}{!specs.length && !error && <div className="empty"><div>◈</div><h2>A useful interface starts with intent.</h2><p>Choose a scenario and run the deterministic stream.<br />Validated components will appear as records arrive.</p></div>}{specs.map(spec => <UIRenderer key={`${runId}-${spec.id}`} spec={spec} />)}<details className="event-log"><summary>Event log <span>{events.length} validated events</span></summary><pre>{events.length ? events.map(event => JSON.stringify(event, null, 2)).join('\n\n') : 'No events yet.'}</pre></details></section></div>
    </main><footer>Independent inspired experiment. Not an OpenAI implementation or a live AI service.</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
