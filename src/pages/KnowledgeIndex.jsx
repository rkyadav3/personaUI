import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useOp } from '../lib/hooks.js';
import { Confirm, Loading, Notice, Progress } from '../components/Ui.jsx';

export default function KnowledgeIndex() {
  const { data: c, reload: reloadCounts, error } = useOp('index.counts');
  const { data: set } = useOp('index.settings');
  const { data: log, reload: reloadLog } = useOp('index.log');
  const [syncing, setSyncing] = useState(false), [pct, setPct] = useState(0), [label, setLabel] = useState(''), [msgs, setMsgs] = useState([]);
  const stop = useRef(false);
  const [q, setQ] = useState(''), [hits, setHits] = useState(null), [searchErr, setSearchErr] = useState('');

  async function sync() {
    setSyncing(true); stop.current = false; setMsgs([]); setPct(0); setLabel('Starting...');
    try {
      const diff = await api('index.sync');
      const cnt = await api('index.counts');
      let embedded = 0, remaining = cnt.chunks - cnt.embedded;
      const total = Math.max(1, remaining);
      // Embedding is rate limited, so ask for ~40 s at a time and keep going until nothing is waiting.
      while (remaining > 0 && !stop.current) {
        const r = await api('index.embed', { seconds: 40 });
        embedded += r.done; remaining = r.remaining;
        setPct(Math.min(1, embedded / total)); setLabel(`Embedded ${embedded} chunks`);
        if (!r.done) break;
      }
      const out = [{ kind: 'success', t: `Added ${diff.added} source(s), removed ${diff.removed}, embedded ${embedded} chunk(s).` }];
      if (remaining) out.push({ kind: 'info', t: `${remaining} chunks still waiting. The free tier limits embedding speed. Press Sync again to continue where it stopped.` });
      setMsgs(out);
    } catch (e) { setMsgs([{ kind: 'error', t: e.message }]); }
    setSyncing(false); reloadCounts();
  }

  async function test(e) {
    e.preventDefault(); if (!q.trim()) return;
    setSearchErr(''); setHits(null);
    try { setHits(await api('index.test', { q })); } catch (ex) { setSearchErr(ex.message); }
    reloadLog();
  }

  if (!c) return <Loading error={error} />;
  return (
    <>
      <h1>Knowledge index</h1>
      <p className="muted">Published files and posts are split into chunks, turned into vectors, and stored in Supabase. The website searches this index. Drafts are never indexed.</p>
      <div className="metrics">
        <div className="metric"><b>{c.chunks}</b><span>Chunks</span></div>
        <div className="metric"><b>{c.embedded}</b><span>Embedded</span></div>
        <div className="metric"><b>{c.chunks - c.embedded}</b><span>Waiting for embedding</span></div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={syncing} onClick={sync} title="Adds new/changed content, drops removed content, and embeds what's pending.">{syncing ? 'Syncing…' : 'Sync now'}</button>
        {syncing && <button className="btn" onClick={() => { stop.current = true; }}>Stop after this batch</button>}
        <Confirm label="Rebuild everything" warn="Deletes every chunk and vector, then you must Sync again (this re-embeds everything)." confirmLabel="Delete the index"
          onConfirm={async () => { await api('index.rebuild'); reloadCounts(); }} />
      </div>
      {syncing && <><Progress value={pct} /><span className="muted">{label}</span></>}
      {msgs.map((m, i) => <Notice key={i} kind={m.kind}>{m.t}</Notice>)}

      <h2 style={{ marginTop: 24 }}>Settings in use</h2>
      {set && <p>Embedding model: <b>{set.model}</b> (768 dimensions) · Similarity gate: <b>{set.minSimilarity}</b> · Keyword gate: <b>{set.minKeywordRank}</b></p>}
      <p className="muted">The public chat reads the same values from its environment variables (MIN_SIMILARITY, MIN_KEYWORD_RANK).</p>

      <h2 style={{ marginTop: 24 }}>Test retrieval</h2>
      <form className="row" onSubmit={test}>
        <input type="text" className="grow" aria-label="Question" placeholder="Ask a question and see which chunks come back" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      <Notice kind="error">{searchErr}</Notice>
      {hits && !hits.length && <Notice kind="info">Nothing passed the relevance gate, so the chatbot would say it has no answer.</Notice>}
      {hits?.map((r, i) => (
        <section className="card" key={r.id} style={{ marginTop: 10 }}>
          <b>{i + 1}. {r.source_name}</b>{r.heading ? ` › ${r.heading}` : ''}
          <div className="muted" style={{ fontSize: '.85rem' }}>similarity {r.similarity.toFixed(3)} · keyword rank {r.keyword_rank.toFixed(2)}</div>
          <p>{r.content.slice(0, 600)}</p>
        </section>
      ))}

      <h2 style={{ marginTop: 24 }}>Recent questions</h2>
      {!log?.length ? <p className="muted">No questions yet.</p> : (
        <>
          <p className="muted">Unanswered questions show what your research is missing, or where the relevance gate is too strict.</p>
          <table className="data"><thead><tr><th>Asked</th><th>Question</th><th>Answered</th><th>Top similarity</th></tr></thead>
            <tbody>{log.map(r => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{r.question}</td><td>{r.answered ? 'yes' : <b>NO</b>}</td><td>{r.top_similarity ?? ''}</td></tr>)}</tbody></table>
        </>
      )}
    </>
  );
}
