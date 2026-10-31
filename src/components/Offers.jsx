import { Badge, Button, Glass } from 'open-glass-ui';

export const money = o => (o.pricing === 'paid' ? (o.price != null ? `${o.currency || ''} ${o.price}`.trim() : 'Paid') : o.pricing === 'free' ? 'Free' : '');

/** "What I offer" panel on the persona page. Visitors can ask the persona about an item, or go straight to buy / book / enquire.
 *  Nothing here is private: the server only sends what the owner published. */
export default function Offers({ name, offers, contact, onAsk, onClose }) {
  return (
    <Glass as="aside" material="frosted" className="offers" aria-label="What I offer">
      <div className="offers-head">
        <div><h2>What {name ? `${name} offers` : 'I offer'}</h2><p className="hint">Ask about anything here, or go straight to it.</p></div>
        <Button variant="quiet" size="small" onClick={onClose} aria-label="Close offers">Close</Button>
      </div>
      <div className="offers-list">
        {offers.map((o, i) => {
          const price = money(o);
          const mail = contact?.email ? `mailto:${contact.email}?subject=${encodeURIComponent(`Interested in: ${o.title}`)}` : null;
          const tel = !mail && contact?.phone ? `tel:${contact.phone.replace(/[^\d+]/g, '')}` : null;
          return (
            <article className="offer-card" key={i}>
              <div className="offer-top">
                <Badge tone="neutral">{o.subtype ? `${o.category}: ${o.subtype}` : o.category}</Badge>
                {price && <Badge tone={o.pricing === 'paid' ? 'accent' : 'positive'}>{price}</Badge>}
              </div>
              <h3>{o.title}</h3>
              {o.description && <p>{o.description}</p>}
              {Object.entries(o.details || {}).slice(0, 3).map(([k, v]) => <div className="offer-meta" key={k}>{k.replace(/_/g, ' ')}: {v}</div>)}
              <div className="row">
                <Button variant="secondary" size="small" onClick={() => onAsk(o)}>Ask about this</Button>
                {o.link && <a className="btn primary" href={o.link} target="_blank" rel="noopener noreferrer nofollow">{o.pricing === 'paid' ? 'Buy / book' : 'Open'}</a>}
                {!o.link && (mail || tel) && <a className="btn primary" href={mail || tel}>{mail ? 'Enquire by email' : 'Call to enquire'}</a>}
              </div>
            </article>
          );
        })}
      </div>
    </Glass>
  );
}
