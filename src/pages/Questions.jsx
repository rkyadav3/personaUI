import { useEffect, useState } from 'react';
import { useOp } from '../lib/hooks.js';
import { fmtDate } from '../lib/format.js';
import '../styles/questions.css';
import { Loading } from '../components/Ui.jsx';

export function QuestionHistory({ data, loading, error, onPage, onRefresh }) {
  if (error) return <section className="card"><p role="alert">Could not load visitor questions: {error}</p><button type="button" className="btn" onClick={onRefresh}>Retry</button></section>;
  if (!data) return <Loading label="Loading visitor questions…" />;
  const { rows, total, page, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <section className="card question-history" aria-busy={!!loading}>
    <div className="head"><h2>Visitor questions ({total})</h2><button type="button" className="btn" disabled={loading} onClick={onRefresh}>Refresh</button></div>
    {!rows.length && <p className="muted">{total ? 'No questions on this page. Go to the previous page or refresh.' : 'No visitor questions yet. Questions asked through your public profile chat will appear here.'}</p>}
    <div className="question-list">{rows.map(row => <article className="question-entry" key={row.id}>
      <div className="head"><span className={`pill ${row.answered ? 'published' : 'draft'}`}>{row.answered ? 'Answered' : 'Unanswered'}</span>{row.created_at && <time dateTime={row.created_at}>{fmtDate(row.created_at)}</time>}</div>
      <h3>{row.question}</h3>
      <p className={`question-answer${row.answer == null ? ' muted' : ''}`}>{row.answer ?? 'Answer was not recorded for this older question.'}</p>
      {!!row.sources?.length && <p className="question-sources"><b>Sources:</b> {row.sources.join(', ')}</p>}
    </article>)}</div>
    {(pages > 1 || page > 1) && <nav className="question-pages" aria-label="Question history pages">
      <button type="button" className="btn" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span role="status">Page {page} of {pages}</span>
      <button type="button" className="btn" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>}
  </section>;
}

export function ProfileQuestions() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useOp('chat.list', { page });
  return <QuestionHistory data={data} loading={loading} error={error} onPage={setPage} onRefresh={reload} />;
}

export default function Questions() {
  useEffect(() => { document.title = 'Visitor Q&A'; }, []);
  return <><div className="head"><div><h1>Visitor Q&amp;A</h1><p className="muted">Review visitors’ questions and the answers given by your public profile persona. Only you can access this history.</p></div></div><ProfileQuestions /></>;
}
