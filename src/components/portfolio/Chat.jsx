import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeBg } from '../../../shared/siteSettings.js';
import { normalizePage } from '../../../shared/pageSettings.js';
import { askPersona } from '../../lib/personaChat.js';
import PersonaBall from '../PersonaBall.jsx';
import LiquidGlass from '../LiquidGlass.jsx';
import Icon from './Icon.jsx';

export default function Chat({ m, ctx, data }) {
  const page = normalizePage(data.page), bg = normalizeBg(data.bg);
  const [input, setInput] = useState(''), [messages, setMessages] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [listening, setListening] = useState(false);
  const inputRef = useRef(null), controller = useRef(null), recognition = useRef(null), pending = useRef(false), end = useRef(null);
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const name = m.first || m.name || 'this creator';
  const prompts = page.chips.length ? page.chips : [
    { label: 'About me', prompt: 'Tell me about yourself and your work' },
    ...(m.products.length ? [{ label: 'Explore the shop', prompt: 'What products and services do you offer?' }] : []),
    ...(m.expertise[0] ? [{ label: m.expertise[0], prompt: `Tell me about your work in ${m.expertise[0]}` }] : []),
  ];
  useEffect(() => () => {
    controller.current?.abort();
    if (recognition.current) { recognition.current.onend = null; recognition.current.onerror = null; recognition.current.onresult = null; recognition.current.abort(); }
  }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' }); }, [messages, busy]);

  async function send(event, text) {
    event?.preventDefault();
    const question = (text ?? input).trim().slice(0, 500);
    if (!question || pending.current) return;
    setError(''); setInput('');
    setMessages(previous => [...previous.slice(-18), { role: 'user', text: question }]);
    if (ctx.preview) {
      setMessages(previous => [...previous, { role: 'assistant', text: 'This is a preview. On your published portfolio, your persona answers from your published knowledge.', sources: [] }]);
      return;
    }
    recognition.current?.stop();
    pending.current = true; setBusy(true);
    const request = new AbortController(); controller.current = request;
    try {
      const reply = await askPersona(ctx.slug, question, { signal: request.signal });
      setMessages(previous => [...previous, { role: 'assistant', text: reply.reply, sources: reply.sources }]);
    } catch (failure) {
      if (failure.name !== 'AbortError') { setError(failure.message); setInput(question); }
    } finally { pending.current = false; setBusy(false); }
  }

  function toggleMicrophone() {
    if (listening) { recognition.current?.stop(); return; }
    if (!SR) return;
    const recorder = new SR(); recognition.current = recorder;
    recorder.lang = navigator.language || 'en-IN'; recorder.interimResults = false;
    recorder.onresult = event => setInput(String(event.results[0][0].transcript).slice(0, 500));
    recorder.onend = () => { setListening(false); inputRef.current?.focus(); };
    recorder.onerror = () => { setListening(false); setError('Microphone access was unavailable. You can type your question below.'); };
    try { recorder.start(); setListening(true); setError(''); }
    catch { setError('The microphone could not start. You can type your question below.'); }
  }

  return (
    <section className={`pf-wrap pf-chat-page sidebar-${page.layout.sidebar}`} aria-label={`Chat with ${name}`}>
      <div className="pf-chat-main">
        <header className="pf-chat-heading">
          <span className="pf-kicker">Meet my persona</span>
          <h1>{page.headline || `Chat with ${name}`}{page.headlineAccent && <> <em>{page.headlineAccent}</em></>}</h1>
          <p>{page.subtitle || `Ask about ${name}’s work, expertise, and offerings. Answers come from published knowledge.`}</p>
        </header>
        <LiquidGlass className="pf-chat-panel" radius={page.theme.radius} refract>
          {page.ball.show && bg.ball && <div className="pf-chat-orb" style={{ opacity: bg.ballOpacity / 100 }} aria-hidden="true"><PersonaBall width={page.ball.size} height={page.ball.size} mode={busy ? 'thinking' : listening ? 'listening' : 'idle'} /></div>}
          <div className={`pf-conversation${messages.length ? ' has-messages' : ''}`} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
            {!messages.length && <p className="pf-chat-welcome">Start a conversation, or choose a question below.</p>}
            {messages.map((message, index) => <article className={`pf-message ${message.role}`} key={index}>
              <span className="pf-message-name">{message.role === 'user' ? 'You' : name}</span>
              <p>{message.text}</p>
              {page.chat.sources && message.sources?.length > 0 && <details className="pf-message-sources"><summary>Sources used</summary><ol>{message.sources.map((source, number) => <li key={source}>[{number + 1}] {source}</li>)}</ol></details>}
            </article>)}
            {busy && <p className="pf-chat-working" role="status">Finding an answer…</p>}
            <div ref={end} />
          </div>
          {error && <p className="pf-chat-error" role="alert">{error}</p>}
          {listening && <p className="pf-chat-working" role="status">Listening… Speak your question, then stop the microphone to edit it.</p>}
          <form className="pf-chat-composer" onSubmit={send}>
            <label className="studio-sr-only" htmlFor={`chat-message-${ctx.slug}`}>Message to {name}</label>
            <input id={`chat-message-${ctx.slug}`} ref={inputRef} aria-label={`Message to ${name}`} value={input} onChange={event => setInput(event.target.value)} maxLength={500} placeholder={page.placeholder || 'Ask me anything about my work…'} autoComplete="off" disabled={busy} />
            {page.chat.mic && SR && <button type="button" className={`pf-chat-mic${listening ? ' listening' : ''}`} aria-label={listening ? 'Stop microphone' : 'Start microphone'} aria-pressed={listening} disabled={busy} onClick={toggleMicrophone}><Icon n="mic" size={20} /></button>}
            <button type="submit" className="pf-chat-send" aria-label="Send message" disabled={busy || !input.trim()}><Icon n="send" size={19} /></button>
          </form>
          <div className="pf-chat-prompts" aria-label="Suggested questions">{prompts.map(prompt => <button key={prompt.label} type="button" disabled={busy} onClick={event => send(event, prompt.prompt)}>{prompt.label}</button>)}</div>
          <p className="pf-chat-footnote">Answers can be imperfect. Check the sources or contact the creator for details.</p>
        </LiquidGlass>
      </div>
      <LiquidGlass as="aside" className={`pf-chat-profile photo-${page.layout.photo}`} radius={page.theme.radius}>
        <div className="pf-chat-person">
          {page.layout.photo !== 'none' && <div className="pf-chat-avatar"><span>{m.initials}</span>{m.photo && <img src={m.photo} alt="" style={{ objectPosition: `${m.heroPos.x}% ${m.heroPos.y}%`, transform: `scale(${m.heroPos.zoom})` }} onError={event => { event.currentTarget.style.display = 'none'; }} />}</div>}
          <div><h2>{m.name}</h2>{(page.tagline || m.titleLine) && <p>{page.tagline || m.titleLine}</p>}</div>
        </div>
        {(page.about || m.bio) && <p className="pf-chat-bio">{page.about || m.bio}</p>}
        {m.expertise.length > 0 && <div className="pf-chips">{m.expertise.slice(0, 6).map(skill => <span key={skill}>{skill}</span>)}</div>}
        {data.contributions?.filter(group => page.placement[group.category] === 'side').map(group => <div key={group.id || group.category} className="pf-chat-offers"><h3>{group.category}</h3>{group.offerings?.map(offering => <button key={offering.id} type="button" disabled={busy} onClick={event => send(event, `Tell me about "${offering.title}"`)}>{offering.title}<Icon n="chat" size={14} /></button>)}</div>)}
        {ctx.preview ? <button type="button" className="pf-btn sm" onClick={() => ctx.go('home')}>{page.openLabel === 'Open persona' ? 'View portfolio' : page.openLabel} <Icon n="arrow" size={15} /></button> : <Link className="pf-btn sm" to={`/p/${ctx.slug}`}>{page.openLabel === 'Open persona' ? 'View portfolio' : page.openLabel} <Icon n="arrow" size={15} /></Link>}
      </LiquidGlass>
    </section>
  );
}
