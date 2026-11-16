import AdminTabs from '../components/AdminTabs.jsx';
import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAdminTab } from '../lib/adminTabs.js';
import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/portfolio/Icon.jsx';
import { useOp } from '../lib/hooks.js';
import { Confirm, Loading, Notice, Pill, Progress } from '../components/Ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import KnowledgePolicies from '../components/KnowledgePolicies.jsx';

export default function KnowledgeIndex() {
  const workspaceRole = useOutletContext()?.workspace?.role;
  const readOnly = workspaceRole === 'viewer';
  const canAdminister = !workspaceRole || ['owner', 'admin'].includes(workspaceRole);
  const user = useAuth()?.user;
  const { data: c, reload: reloadCounts, error } = useOp('index.counts');
  const { data: set, error: settingsError, reload: reloadSettings } = useOp('index.settings');

  const [activeTab, setActiveTab] = useAdminTab({ values: ['sync', 'test'], defaultValue: 'sync' });

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
    if (readOnly || syncing) return;
    setSyncing(true); stop.current = false; setMsgs([]); setPct(0); setLabel('Analyzing source files…');
    try {
      const diff = await api('index.sync');
      const cnt = await api('index.counts');
      let embedded = 0, remaining = cnt.chunks - cnt.embedded;
      const total = Math.max(1, remaining);
      while (remaining > 0 && !stop.current) {
        const r = await api('index.embed', { seconds: 40 });
        embedded += r.done; remaining = r.remaining;
        setPct(Math.min(1, embedded / total)); setLabel(`Prepared ${embedded} passages…`);
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
    if (!q.trim() || searchBusy || readOnly) return;
    setSearchBusy(true); setSearchErr(''); setHits(null);
    try {
      setHits(await api('index.test', { q }));
    } catch (ex) { setSearchErr(ex.message); }
    setSearchBusy(false);
  }

  if (!c) return <><Loading error={error} />{error && <button className="btn" onClick={reloadCounts}>Retry knowledge status</button>}</>;

  const waiting = c.chunks - c.embedded;
  const readyPct = c.chunks > 0 ? Math.round((c.embedded / c.chunks) * 100) : 0;

  return (
    <>
      <div className="head">
        <div>
          <h1>AI knowledge</h1>
          <p className="muted" style={{ margin: 0 }}>
            Check which published materials are ready for AI answers and test what your persona can find.
          </p>
        </div>
      </div>

      {/* UX Guide Banner */}
      <div className="ux-guide-banner">
        <div className="ux-guide-icon"><Icon n="book" size={24} /></div>
        <div className="ux-guide-content">
          <h4>How Your AI Persona Learns</h4>
          <p>
            Publish files or articles, then sync any waiting material. Test a question below to see which passages your AI can use in an answer.
          </p>
        </div>
      </div>

      {/* Health / Readiness Progress Meter */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>AI Knowledge Readiness: {readyPct}%</strong>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '.86rem' }}>
              {waiting > 0 ? `${waiting} passages are waiting to be prepared for answers.` : (c.chunks ? 'All prepared passages are ready for your chatbot to search.' : 'Publish a file or article to start building your AI knowledge.')}
            </p>
          </div>
          <button
            className="btn primary"
            disabled={syncing || readOnly}
            onClick={sync}
          >
            <Icon n="refresh" size={18} />{syncing ? 'Preparing…' : 'Prepare chatbot knowledge'}
          </button>
        </div>

        <div className="progress" style={{ height: 10 }}>
          <i style={{ width: `${readyPct}%` }} />
        </div>

        <div className="metrics" style={{ marginTop: 14 }}>
          <div className="metric"><b>{c.chunks}</b><span>Total passages</span></div>
          <div className="metric"><b>{c.embedded}</b><span>Ready for answers</span></div>
          <div className="metric"><b>{waiting}</b><span>Waiting to prepare</span></div>
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
      <AdminTabs label="AI knowledge tools" value={activeTab} onChange={setActiveTab} items={[{ id: 'sync', label: 'Knowledge readiness', icon: 'book' }, { id: 'test', label: 'Test a question', icon: 'search' }]} />
      {user?.workspaceEnabled && <KnowledgePolicies readOnly={!!workspaceRole && !['owner', 'admin'].includes(workspaceRole)} />}
      {canAdminister && <p className="hint">Questions from your public chat are in <Link to="/admin/questions">Inbox → Visitor Q&amp;A</Link>.</p>}

      {/* TAB 1: HOW IT WORKS & ADVANCED CONTROLS */}
      {activeTab === 'sync' && (
        <>
          <div className="ux-step-cards">
            <div className="ux-step-card">
              <div className="ux-step-num">1</div>
              <h5>Upload Your Materials</h5>
              <p>Upload documents in Files & notes or write an article in Content.</p>
            </div>
            <div className="ux-step-card">
              <div className="ux-step-num">2</div>
              <h5>Prepare chatbot knowledge</h5>
              <p>Choose “Prepare chatbot knowledge” to make waiting passages searchable.</p>
            </div>
            <div className="ux-step-card">
              <div className="ux-step-num">3</div>
              <h5>Visitors ask questions</h5>
              <p>Your persona searches the published material for context when answering visitors.</p>
            </div>
          </div>

          <details className="card" style={{ marginTop: 18 }}>
            <summary>Advanced search settings</summary>
            {settingsError && <Notice kind="error">Search settings are unavailable. <button className="btn small" onClick={reloadSettings}>Retry search settings</button></Notice>}
            {set ? (
              <p style={{ fontSize: '.9rem', color: '#475569' }}>
                Embedding Model: <b>{set.model}</b> (768 dimensions) ·
                Similarity Threshold: <b>{set.minSimilarity}</b> ·
                Keyword Match: <b>{set.minKeywordRank}</b>
              </p>
            ) : null}
            {canAdminister && <div className="row" style={{ marginTop: 12 }}>
              <Confirm
                label="Rebuild Everything"
                warn="This clears the vector index and re-extracts all published files from scratch. Only use this if you change your embedding model."
                confirmLabel="Yes, rebuild index"
                onConfirm={async () => { try { await api('index.rebuild'); reloadCounts(); } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); } }}
              />
            </div>}
          </details>
        </>
      )}

      {/* TAB 2: TEST AI RETRIEVAL */}
      {activeTab === 'test' && (
        <section className="card">
          <h3>Test a question</h3>
          <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
            Ask a question to see which passages your chatbot can find. This checks the available information; it does not generate a full chatbot answer.
          </p>

          <form onSubmit={test} className="row">
            <input
              type="text"
              aria-label="Test a question against AI knowledge"
              className="grow"
              placeholder="e.g. What are the key principles of IoT architecture?"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
            <button className="btn primary" disabled={searchBusy || !q.trim() || readOnly}>
              {searchBusy ? 'Searching…' : 'Search Notes'}
            </button>
          </form>

          <Notice kind="error">{searchErr}</Notice>

          {hits && !hits.length && (
            <Notice kind="info">
              No relevant passages were found. Add information about this topic, make it available to your chatbot, then prepare the knowledge again.
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

    </>
  );
}
