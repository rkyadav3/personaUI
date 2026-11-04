// Cards for the public "Updates" page and the "What's new" block on the home page.
import { calendarUrl, fmtDay, fmtRange } from '../../lib/when.js';
import Icon from './Icon.jsx';

const isExt = u => /^https?:\/\//i.test(u);
function Link({ href, children, className = 'pf-btn sm' }) {
  if (!href) return null;
  return <a className={className} href={href} {...(isExt(href) ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>{children}</a>;
}

/** An announcement. If it carries a date in the future it is marked Upcoming and shows that date. */
export function UpdateCard({ u, now }) {
  const upcoming = u.startsAt && new Date(u.startsAt).getTime() > now;
  const when = upcoming ? u.startsAt : (u.createdAt || u.startsAt);
  return (
    <article className="pf-card pf-upd">
      <div className="pf-meta">
        {u.pinned && <span className="pf-pill sm">Pinned</span>}
        {upcoming && <span className="pf-pill sm up">Upcoming</span>}
        {when && <small>{upcoming ? 'On ' : ''}{fmtDay(when)}</small>}
      </div>
      <h3>{u.title}</h3>
      {u.body && <p className="pf-pre">{u.body}</p>}
      {u.location && <small className="pf-evt-line"><Icon n="pin" size={14} /> {u.location}</small>}
      {u.url && <div className="pf-feat-act"><Link href={u.url}>{u.linkLabel || 'Learn more'} <Icon n="arrow" size={14} /></Link></div>}
    </article>
  );
}

/** One dated item of the schedule, with an "add to calendar" link while it is still to come. */
export function EventRow({ x, now, past = false, children }) {
  const d = new Date(x.startsAt), live = !past && d.getTime() <= now;
  return (
    <article className={`pf-card pf-evt${past ? ' past' : ''}`}>
      <div className="pf-date" aria-hidden="true"><b>{d.getDate()}</b><span>{d.toLocaleString(undefined, { month: 'short' })}</span></div>
      <div className="pf-evt-body">
        {live && <span className="pf-pill sm up">Happening now</span>}
        <h3>{x.title}</h3>
        <small className="pf-evt-line"><Icon n="calendar" size={14} /> {fmtRange(x)}</small>
        {x.location && <small className="pf-evt-line"><Icon n="pin" size={14} /> {x.location}</small>}
        {x.body && <p className="pf-pre">{x.body}</p>}
        {!past && (
          <div className="pf-feat-act">
            <Link href={x.url}>{x.linkLabel || 'Details'} <Icon n="arrow" size={14} /></Link>
            <Link href={calendarUrl(x)}><Icon n="calendar" size={14} /> Add to calendar</Link>
          </div>
        )}
        {children}
      </div>
    </article>
  );
}
