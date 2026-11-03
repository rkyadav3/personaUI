import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useOp } from '../lib/hooks.js';
import { Confirm, Loading, Notice, Pill, Progress } from '../components/Ui.jsx';

export default function KnowledgeIndex() {
  const { data: c, reload: reloadCounts, error } = useOp('index.counts');
  const { data: set } = useOp('index.settings');
  const { data: log, reload: reloadLog } = useOp('index.log');

  const [activeTab, setActiveTab] = useState('sync'); // 'sync' | 'test' | 'logs'

  const [syncing, setSyncing] = useState(false);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('');
  const [msgs, setMsgs] = useState([]);
  const stop = useRef(false);

  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [searchErr, setSearchErr] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);

  async function sync() {
    setSyncing(true); stop.current = false; setMsgs([]); setPct(0); setLabel('Analyzing source files…');
    try {
      const diff = await api('index.sync');
      const cnt = await api('index.counts');
      let embedded = 0, remaining = cnt.chunks - cnt.embedded;
      const total = Math.max(1, remaining);
      while (remaining > 0 && !stop.current) {
        const r = await api('index.embed', { seconds: 40 });
        embedded += r.done; remaining = r.remaining;
        setPct(Math.min(1, embedded / total)); setLabel(`Embedded ${embedded} chunks…`);
        if (!r.done) break;
      }
      const out = [{ kind: 'success', t: `Synced successfully: added ${diff.added} source(s), removed ${diff.removed}, embedded ${embedded} chunk(s).` }];
      if (remaining) out.push({ kind: 'info', t: `${remaining} chunks still waiting to embed. Click Sync again to continue.` });
      setMsgs(out);
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
    setSyncing(false); reloadCounts();
  }

  async function test(e) {
    e.preventDefault();
    if (!q.trim() || searchBusy) return;
    setSearchBusy(true); setSearchErr(''); setHits(null);
    try {
      setHits(await api('index.test', { q }));
    } catch (ex) { setSearchErr(ex.message); }
    setSearchBusy(false);
    reloadLog();
  }

  if (!c) return <Loading error={error} />;

  const waiting = c.chunks - c.embedded;
  const readyPct = c.chunks > 0 ? Math.round((c.embedded / c.chunks) * 100) : 100;

  return (
    <>
      <div className="head">
        <div>
          <h1>Knowledge Index &amp; AI Brain</h1>
          <p className="muted" style={{ margin: 0 }}>
            Monitor and sync the vector database that powers your Persona’s answers.
          </p>
        </div>
      </div>

      {/* UX Guide Banner */}
      <div className="ux-guide-banner">
        <div className="ux-guide-icon">🧠</div>
        <div className="ux-guide-content">
          <h4>How Your AI Persona Learns</h4>
          <p>
            When you publish research files or writing, this system splits them into bite-sized "chunks" and converts them into mathematical vectors. When a visitor asks a question, your Persona searches these vectors to find the best citations.
          </p>
        </div>
      </div>

      {/* Health / Readiness Progress Meter */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>AI Knowledge Readiness: {readyPct}%</strong>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '.86rem' }}>
              {waiting > 0 ? `${waiting} knowledge chunks are waiting to be embedded.` : 'All published files are fully indexed and searchable!'}
            </p>
          </div>
          <button
            className="btn primary"
            disabled={syncing}
            onClick={sync}
          >
            {syncing ? 'Syncing to AI Brain…' : waiting > 0 ? '⚡ Sync Now' : '✓ Knowledge Up to Date'}
          </button>
        </div>

        <div className="progress" style={{ height: 10 }}>
          <i style={{ width: `${readyPct}%` }} />
        </div>

        <div className="metrics" style={{ marginTop: 14 }}>
          <div className="metric"><b>{c.chunks}</b><span>Total Chunks</span></div>
          <div className="metric"><b>{c.embedded}</b><span>Embedded &amp; Ready</span></div>
          <div className="metric"><b>{waiting}</b><span>Waiting Sync</span></div>
        </div>

        {syncing && (
          <div style={{ marginTop: 12 }}>
            <Progress value={pct} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span className="muted" style={{ fontSize: '.84rem' }}>{label}</span>
              <button className="btn small" onClick={() => { stop.current = true; }}>Stop after current batch</button>
            </div>
          </div>
        )}

        {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}
      </section>

      {/* Page Tabs */}
      <div className="page-tabs-wrap">
        <button
          className={`page-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          <span>🧠 Brain Status &amp; Sync</span>
        </button>
        <button
          className={`page-tab-btn ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => setActiveTab('test')}
        >
          <span>🔍 Test AI Retrieval</span>
        </button>
        <button
          className={`page-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <span>💬 Visitor Query Logs</span>
          {log && <span className="page-tab-badge">{log.length}</span>}
        </button>
      </div>

      {/* TAB 1: HOW IT WORKS & ADVANCED CONTROLS */}
      {activeTab === 'sync' && (
        <>
          <div className="ux-step-cards">
            <div className="ux-step-card">
              <div className="ux-step-num">1</div>
              <h5>Upload Your Materials</h5>
              <p>Add research papers, notes, or articles in the File Manager or Writing Studio.</p>
            </div>
            <div className="ux-step-card">
              <div className="ux-step-num">2</div>
              <h5>Sync to Vector Brain</h5>
              <p>Click "Sync Now" to process text into 768-dimensional AI embeddings.</p>
            </div>
            <div className="ux-step-card">
              <div className="ux-step-num">3</div>
              <h5>Persona Speaks Answers</h5>
              <p>Visitors ask questions on your site; your persona retrieves and speaks accurate answers!</p>
            </div>
          </div>

          <section className="card" style={{ marginTop: 18 }}>
            <h3>Advanced Vector Settings</h3>
            {set ? (
              <p style={{ fontSize: '.9rem', color: '#475569' }}>
                Embedding Model: <b>{set.model}</b> (768 dimensions) ·
                Similarity Threshold: <b>{set.minSimilarity}</b> ·
                Keyword Match: <b>{set.minKeywordRank}</b>
              </p>
            ) : null}
            <div className="row" style={{ marginTop: 12 }}>
              <Confirm
                label="Rebuild Everything"
                warn="This clears the vector index and re-extracts all published files from scratch. Only use this if you change your embedding model."
                confirmLabel="Yes, rebuild index"
                onConfirm={async () => { await api('index.rebuild'); reloadCounts(); }}
              />
            </div>
          </section>
        </>
      )}

      {/* TAB 2: TEST AI RETRIEVAL */}
      {activeTab === 'test' && (
        <section className="card">
          <h3>Test AI Retrieval Simulator</h3>
          <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
            Type any question below. This test shows which chunks of your research files will be returned to your Persona to answer that question.
          </p>

          <form onSubmit={test} className="row">
            <input
              type="text"
              className="grow"
              placeholder="e.g. What are the key principles of IoT architecture?"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
            <button className="btn primary" disabled={searchBusy || !q.trim()}>
              {searchBusy ? 'Searching…' : 'Search Notes'}
            </button>
          </form>

          <Notice kind="error">{searchErr}</Notice>

          {hits && !hits.length && (
            <Notice kind="info">
              No chunks passed the similarity threshold for this query. The persona would say it doesn't have enough notes on this topic.
            </Notice>
          )}

          {hits?.map((r, i) => (
            <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px 18px', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#1e1b4b' }}>
                  {i + 1}. {r.source_name} {r.heading ? ` › ${r.heading}` : ''}
                </strong>
                <span className="pill active" style={{ fontSize: '.76rem' }}>
                  {(r.similarity * 100).toFixed(1)}% Match
                </span>
              </div>
              <span className="muted" style={{ fontSize: '.78rem', display: 'block', marginBottom: 8 }}>
                Vector similarity: {r.similarity.toFixed(3)} · Keyword rank: {r.keyword_rank.toFixed(2)}
              </span>
              <p style={{ margin: 0, fontSize: '.9rem', color: '#334155', lineHeight: 1.5 }}>
                {r.content.slice(0, 500)}…
              </p>
            </div>
          ))}
        </section>
      )}

      {/* TAB 3: VISITOR QUERY LOGS */}
      {activeTab === 'logs' && (
        <section className="card">
          <h3>Visitor Questions Log</h3>
          <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
            Real questions asked by visitors on your public page. Unanswered questions highlight topics you might want to write about next!
          </p>

          {!log?.length ? (
            <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
              No visitor queries recorded yet. Questions asked on your Persona page will appear here.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Asked Date</th>
                  <th>Visitor Question</th>
                  <th>Answered Status</th>
                  <th>Top Relevance</th>
                </tr>
              </thead>
              <tbody>
                {log.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: '.84rem' }}>{fmtDate(r.created_at)}</td>
                    <td><strong>{r.question}</strong></td>
                    <td>
                      <span className={`pill ${r.answered ? 'published' : 'revoked'}`}>
                        {r.answered ? '✓ Answered' : '✗ Missed (No Notes)'}
                      </span>
                    </td>
                    <td>
                      {r.top_similarity != null ? `${(r.top_similarity * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
