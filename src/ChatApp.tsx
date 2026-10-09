import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { UIRenderer } from './components';
import type { ChatEvent } from './chat-protocol';
import { mockProvider, type Scenario } from './provider';
import { buildMessages, chatReducer, type Mode, type Turn } from './chat-state';
import { consumeChat, loadConfig, streamChat, type ServerConfig } from './chat-transport';

export function ChatApp() {
  const [turns, dispatch] = useReducer(chatReducer, []);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('mock');
  const [model, setModel] = useState('');
  const [scenario, setScenario] = useState<Scenario>('skew');
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [configLoading, setConfigLoading] = useState(true);
  const [configRevision, setConfigRevision] = useState(0);
  const active = useRef<{ controller: AbortController; id: number } | null>(null);
  const nextId = useRef(1);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const running = turns.some(turn => turn.status === 'streaming');
  useEffect(() => {
    const controller = new AbortController();
    setConfigError('');
    setConfigLoading(true);
    void loadConfig(controller.signal).then(value => {
      if (!controller.signal.aborted) { setConfig(value); setModel(value.defaultModel); }
    }).catch(cause => { if (!controller.signal.aborted) { setConfig(null); setConfigError(cause instanceof Error ? cause.message : 'Could not load the server configuration.'); } }).finally(() => { if (!controller.signal.aborted) setConfigLoading(false); });
    return () => controller.abort();
  }, [configRevision]);
  useEffect(() => () => { active.current?.controller.abort(); active.current = null; }, []);
  function stop() {
    const request = active.current;
    active.current = null;
    request?.controller.abort();
    if (request) dispatch({ type: 'settle', id: request.id, status: 'stopped' });
  }
  const serverReady = Boolean(!configLoading && config?.ready && model && config.models.includes(model));
  async function run(retry?: Turn) {
    if (active.current || (mode === 'server' && !serverReady)) return;
    const question = retry?.prompt ?? prompt.trim();
    if (!question || question.length > 4000) return;
    const turn: Turn = { id: retry?.id ?? nextId.current++, prompt: question, mode, model: mode === 'mock' ? 'Local fixture' : model, scenario, text: '', components: [], blocks: [], status: 'streaming' };
    const controller = new AbortController();
    const request = { controller, id: turn.id };
    active.current = request;
    dispatch({ type: 'start', turn });
    if (!retry) setPrompt('');
    const accept = (event: ChatEvent) => {
      if (active.current === request && !controller.signal.aborted) dispatch({ type: 'event', id: turn.id, event });
    };
    try {
      if (mode === 'mock') await consumeChat(mockProvider.stream(scenario, controller.signal), controller.signal, accept);
      else await streamChat(buildMessages(turns, turn), model, controller.signal, accept);
      if (active.current === request) dispatch({ type: 'settle', id: turn.id, status: 'complete' });
    } catch (cause) {
      if (active.current === request && !controller.signal.aborted) dispatch({ type: 'settle', id: turn.id, status: 'error', error: cause instanceof Error ? cause.message : 'The response could not be completed.' });
    } finally {
      if (active.current === request) active.current = null;
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void run(); }
  const latest = turns.at(-1);
  return <div className="app chat-app">
    <header><a className="wordmark" href="./">◈ <span>Intelligent UI <b>Lab</b></span></a><span className="version">STREAMING CHAT</span></header>
    <main>
      <div className="eyebrow">FROM QUESTION TO INTERFACE</div><h1>Ask. Explore.<br />Keep the conversation going.</h1>
      <p className="intro">Streamed explanations with interactive, validated components. This app does not save your conversation.</p>
      <div className="chat-layout">
        <aside className="controls" aria-label="Chat settings">
          <h2>Response settings</h2>
          <label htmlFor="mode">Provider</label><select id="mode" value={mode} onChange={event => { stop(); setMode(event.target.value as Mode); }}><option value="mock">Local mock · no model calls</option><option value="server">Chat server</option></select>
          {mode === 'mock' ? <><label htmlFor="scenario">Mock fixture</label><select id="scenario" value={scenario} onChange={event => { stop(); setScenario(event.target.value as Scenario); }}><option value="skew">Explore data skew</option><option value="text">A simple definition</option><option value="invalid">Reject an unsafe component</option></select><p className="small">A deterministic fixture, independent of your question. This mode does not use AI.</p></> : <>
            <label htmlFor="model">Model</label><select id="model" value={model} disabled={!config?.models.length} onChange={event => { stop(); setModel(event.target.value); }}>{!config?.models.length && <option value="">No model configured</option>}{config?.models.map(value => <option key={value} value={value}>{value}</option>)}</select>
            <p className="small">{config?.ready ? config.mode === 'mock' ? 'Server mock · no model calls. Responses are deterministic.' : 'Live mode sends your question and recent conversation through the server to OpenAI. API charges and provider data policies apply.' : 'Live chat is disabled until the server has a key and model configured.'}</p>
            {configError && <p role="alert" className="error">{configError}</p>}
            <button className="secondary" disabled={running || configLoading} onClick={() => { setConfigLoading(true); setConfigRevision(value => value + 1); }}>{configLoading ? 'Loading server settings…' : 'Refresh server settings'}</button>
          </>}
          <p className="small">Changing settings stops the active response. Completed turns remain. Only recent completed exchanges from the same provider mode are sent as context.</p>
          <button className="secondary" disabled={!turns.length} onClick={() => { stop(); dispatch({ type: 'reset' }); setPrompt(''); promptRef.current?.focus(); }}>Reset conversation</button>
          <p className="small">No browser API keys. Generated components cannot run code or take external actions.</p>
        </aside>
        <section className="conversation" aria-label="Conversation">
          {!turns.length && <div className="empty"><div>◈</div><h2>Start with a question.</h2><p>Try “Explain data skew with an example.”<br />Use Chat server for live multi-turn answers.</p></div>}
          <ol className="turn-list">{turns.map(turn => <li key={turn.id} className="turn">
            <section className="question" aria-label="Your question"><span className="speaker">YOU</span><p>{turn.prompt}</p></section>
            <section className="answer" aria-label={`Response ${turn.id}`} aria-busy={turn.status === 'streaming'}>
              <div className="preview-heading"><span>{turn.mode === 'mock' ? 'LOCAL MOCK' : 'CHAT SERVER'} · {turn.model}</span><span role="status" className={`status ${turn.status === 'streaming' ? 'live' : ''}`}>{turn.status === 'stopped' ? 'Stopped · partial response' : turn.status}</span></div>
              {turn.blocks.map((block, index) => block.type === 'text'
                ? <p className="answer-text" key={`text-${index}`}>{block.text}</p>
                : <UIRenderer key={`component-${block.spec.id}`} spec={block.spec} idPrefix={`turn-${turn.id}-`} />)}
              {!turn.text && !turn.components.length && turn.status === 'streaming' && <p className="small">Waiting for the first validated response…</p>}
              {turn.error && <p className="error" role="alert">{turn.error} Any valid partial response is retained.</p>}
              {latest?.id === turn.id && ['stopped', 'error'].includes(turn.status) && <button className="secondary" disabled={running || (mode === 'server' && !serverReady)} onClick={() => void run(turn)}>Retry with current settings</button>}
            </section>
          </li>)}</ol>
          <form className="composer" onSubmit={submit}>
            <label htmlFor="prompt">Your question</label><textarea ref={promptRef} id="prompt" rows={3} maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask a question or follow up…" aria-describedby="composer-help" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!running) void run(); } }} />
            <div className="composer-actions"><span id="composer-help" className="small">Enter to send · Shift+Enter for a new line · {prompt.length}/4000</span>{running ? <button type="button" onClick={stop}>Stop response</button> : <button type="submit" disabled={!prompt.trim() || (mode === 'server' && !serverReady)}>Send question ↗</button>}</div>
          </form>
        </section>
      </div>
    </main><footer>Independent UI experiment. Local mock is offline; live mode uses the configured server. No conversation persistence or deployment is included.</footer>
  </div>;
}
