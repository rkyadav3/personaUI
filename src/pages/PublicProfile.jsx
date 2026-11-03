import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import GlassShell from '../components/GlassShell.jsx';
import PersonaBall, { amp } from '../components/PersonaBall.jsx';
import { StarInput, Stars } from '../components/Stars.jsx';
import { api } from '../lib/api.js';
import { track } from '../lib/track.js';

// Clean SVG illustrations for featured products so they render reliably offline
const IMG_BOOK_1 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380"><rect width="100%" height="100%" fill="%23f8fafc"/><rect x="40" y="30" width="220" height="320" rx="8" fill="%23ffffff" stroke="%23cbd5e1" stroke-width="2"/><rect x="55" y="45" width="8" height="290" fill="%23f1f5f9"/><text x="75" y="90" font-family="system-ui" font-size="20" font-weight="bold" fill="%230f172a">System</text><text x="75" y="115" font-family="system-ui" font-size="20" font-weight="bold" fill="%230f172a">Design</text><text x="75" y="140" font-family="system-ui" font-size="16" font-weight="600" fill="%236366f1">Interview</text><rect x="75" y="170" width="150" height="2" fill="%23e2e8f0"/><text x="75" y="210" font-family="system-ui" font-size="11" fill="%2364748b">An Insider%27s Guide</text><text x="75" y="230" font-family="system-ui" font-size="11" fill="%2364748b">Scalable Architectures</text><rect x="75" y="260" width="140" height="40" rx="4" fill="%23ede9fe"/><text x="145" y="285" font-family="system-ui" font-size="11" font-weight="bold" fill="%234f46e5" text-anchor="middle">BESTSELLER</text></svg>';
const IMG_BOOK_2 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380"><rect width="100%" height="100%" fill="%231e293b"/><rect x="40" y="30" width="220" height="320" rx="8" fill="%230f172a" stroke="%23334155" stroke-width="2"/><rect x="40" y="140" width="220" height="40" fill="%23eab308"/><text x="150" y="90" font-family="system-ui" font-size="18" font-weight="bold" fill="%23ffffff" text-anchor="middle">Product</text><text x="150" y="115" font-family="system-ui" font-size="18" font-weight="bold" fill="%23ffffff" text-anchor="middle">Management</text><text x="150" y="167" font-family="system-ui" font-size="22" font-weight="900" fill="%230f172a" text-anchor="middle">101</text><text x="150" y="230" font-family="system-ui" font-size="11" fill="%2394a3b8" text-anchor="middle">From zero to launch</text></svg>';
const IMG_HARDWARE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380"><rect width="100%" height="100%" fill="%23f1f5f9"/><rect x="50" y="50" width="200" height="280" rx="6" fill="%231e293b"/><rect x="70" y="80" width="160" height="120" rx="4" fill="%2394a3b8"/><text x="150" y="145" font-family="system-ui" font-size="14" font-weight="bold" fill="%230f172a" text-anchor="middle">ESP-WROOM-32</text><rect x="60" y="220" width="180" height="8" rx="2" fill="%23eab308"/><rect x="60" y="240" width="180" height="8" rx="2" fill="%23eab308"/><circle cx="100" cy="280" r="10" fill="%23ef4444"/><text x="150" y="285" font-family="system-ui" font-size="11" font-weight="bold" fill="%23ffffff" text-anchor="middle">DevKit v1</text></svg>';
const IMG_CAMERA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380"><rect width="100%" height="100%" fill="%23f1f5f9"/><rect x="110" y="160" width="80" height="150" fill="%23d97706"/><circle cx="150" cy="120" r="60" fill="%231e293b"/><circle cx="150" cy="120" r="38" fill="%230f172a" stroke="%2338bdf8" stroke-width="4"/><circle cx="150" cy="120" r="18" fill="%230284c7"/><text x="150" y="240" font-family="system-ui" font-size="13" font-weight="bold" fill="%23ffffff" text-anchor="middle">OV2640</text></svg>';
const IMG_DIGITAL = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380"><rect width="100%" height="100%" fill="%23042f2e"/><rect x="60" y="70" width="180" height="240" rx="16" fill="%230d9488"/><text x="150" y="200" font-family="monospace" font-size="44" font-weight="bold" fill="%23ffffff" text-anchor="middle">&lt;/&gt;</text><text x="150" y="250" font-family="system-ui" font-size="13" font-weight="bold" fill="%23ccfbf1" text-anchor="middle">IoT Suite Pro</text></svg>';

export default function PublicProfile({ initialChatFocus = false }) {
  return <GlassShell><UnifiedPage initialChatFocus={initialChatFocus} /></GlassShell>;
}

function UnifiedPage({ initialChatFocus }) {
  const { slug } = useParams();
  const effectiveSlug = slug || 'default';

  const [p, setP] = useState(undefined);
  const [user, setUser] = useState(null);

  // Active section tab: 'home' | 'research' | 'store' | 'updates' | 'about'
  const [activeTab, setActiveTab] = useState('home');

  // Contact modal state
  const [talkOpen, setTalkOpen] = useState(false);

  // Cart state
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([
    { id: 'item-1', title: 'System Design Interview', price: 599, count: 1, image: IMG_BOOK_1 },
    { id: 'item-2', title: 'ESP32 DevKitC', price: 599, count: 1, image: IMG_HARDWARE },
  ]);

  // AI Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState('idle'); // 'idle' | 'thinking' | 'talking' | 'listening'
  const [chatImpulse, setChatImpulse] = useState(0);
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatSources, setChatSources] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);

  const chatInputRef = useRef(null);
  const typerRef = useRef(null);

  // Category filter state for Featured Products
  const [selectedCat, setSelectedCat] = useState('All');

  // Load profile data
  useEffect(() => {
    fetch(`/api/profile?slug=${encodeURIComponent(effectiveSlug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setP(data);
        if (data?.name) document.title = `${data.name} — Studio & AI Persona`;
      }, () => setP(null));

    track({ kind: 'profile', slug: effectiveSlug });
  }, [effectiveSlug]);

  // Check auth for Navbar
  useEffect(() => {
    api('auth.me').then(m => setUser(m.user), () => {});
  }, []);

  // Initial focus on chat if requested
  useEffect(() => {
    if (initialChatFocus) {
      setTimeout(() => chatInputRef.current?.focus(), 500);
    }
  }, [initialChatFocus]);

  // Handle typing & speaking animation
  function speakResponse(text, sources = []) {
    clearInterval(typerRef.current);
    setChatAnswer('');
    setChatSources([]);
    setChatMode('talking');

    let i = 0;
    typerRef.current = setInterval(() => {
      const char = text[i++] || '';
      setChatAnswer(text.slice(0, i));
      setChatImpulse(amp(char) * (0.8 + Math.random() * 0.4));

      if (i >= text.length) {
        clearInterval(typerRef.current);
        setChatMode('idle');
        setChatBusy(false);
        if (sources?.length) setChatSources(sources.slice(0, 4));
      }
    }, 28);
  }

  // Handle chat submission
  async function handleChatSubmit(e) {
    if (e) e.preventDefault();
    const query = chatInput.trim();
    if (!query || chatBusy) return;

    setChatBusy(true);
    setChatInput('');
    clearInterval(typerRef.current);
    setChatAnswer('');
    setChatSources([]);
    setChatMode('thinking');
    setChatImpulse(0.5);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, slug: effectiveSlug }),
      });
      const data = await res.json();
      speakResponse(data.reply || data.error || 'I could not find an answer in my notes.', data.sources);
    } catch {
      speakResponse("I can't reach my notes right now. Please try again in a moment.", []);
    }
  }

  // Quick chip click
  function handleChipClick(chipText) {
    setChatInput(chipText);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  }

  // Add to cart helper
  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => (item.id === product.id ? { ...item, count: item.count + 1 } : item));
      }
      return [...prev, { ...product, count: 1 }];
    });
    setCartOpen(true);
  }

  // Cart total
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.count, 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.count, 0), [cart]);

  // Featured Products list (combining DB offerings + curated catalogue for full design match)
  const defaultProducts = useMemo(() => [
    {
      id: 'prod-1',
      title: 'System Design Interview',
      category: 'Books',
      tag: 'Book',
      desc: 'A practical guide to scalable systems and high-throughput architectures.',
      price: 599,
      image: IMG_BOOK_1,
    },
    {
      id: 'prod-2',
      title: 'Product Management 101',
      category: 'Books',
      tag: 'Book',
      desc: 'From ideas to shipping products that customers love and adopt.',
      price: 499,
      image: IMG_BOOK_2,
    },
    {
      id: 'prod-3',
      title: 'ESP32 DevKitC',
      category: 'Hardware & IoT',
      tag: 'Hardware',
      desc: 'Wi-Fi + Bluetooth microcontroller for IoT and edge projects.',
      price: 599,
      image: IMG_HARDWARE,
    },
    {
      id: 'prod-4',
      title: 'OV2640 Camera Module',
      category: 'Hardware & IoT',
      tag: 'Hardware',
      desc: '2MP camera sensor for computer vision and edge IoT projects.',
      price: 349,
      image: IMG_CAMERA,
    },
    {
      id: 'prod-5',
      title: 'IoT Attendance System',
      category: 'Digital Products',
      tag: 'Digital',
      desc: 'Complete source code, PCB schematics, wiring guide and dashboard.',
      price: 999,
      image: IMG_DIGITAL,
    },
  ], []);

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    if (selectedCat === 'All') return defaultProducts;
    return defaultProducts.filter(item => item.category.toLowerCase().includes(selectedCat.toLowerCase()));
  }, [defaultProducts, selectedCat]);

  // Member profile data (fallback to uploaded design values if DB profile not yet filled)
  const memberName = p?.name || 'Ravi Kumar Yadav';
  const memberRole = p?.designation || 'Technology & Product Development Enthusiast';
  const memberBio = p?.purpose || 'My primary objective is to exchange knowledge, learn from diverse experiences, explore new opportunities, and contribute to meaningful technology-driven initiatives.';
  const memberExpertise = p?.expertise?.length
    ? p.expertise
    : ['Artificial Intelligence', 'Machine Learning', 'IoT', 'Computer Vision', 'Software Development', 'SaaS Product Development'];
  const memberEmail = p?.contact?.email || 'contact@raviyadav.dev';
  const memberPhone = p?.contact?.phone || '+91 98765 43210';

  return (
    <div className="uni-page">
      {/* 1. TOP NAVBAR */}
      <header className="uni-nav">
        <Link to={`/p/${effectiveSlug}`} className="uni-brand">
          <div className="uni-avatar-badge" aria-hidden="true" />
          <span>{memberName}</span>
        </Link>

        <nav className="uni-nav-tabs" aria-label="Sections">
          <button
            className={`uni-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => { setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            <span>🏠</span> Home
          </button>
          <button
            className={`uni-tab-btn ${activeTab === 'research' ? 'active' : ''}`}
            onClick={() => { setActiveTab('research'); document.getElementById('sec-explore')?.scrollIntoView({ behavior: 'smooth' }); }}
          >
            <span>📚</span> Research
          </button>
          <button
            className={`uni-tab-btn ${activeTab === 'store' ? 'active' : ''}`}
            onClick={() => { setActiveTab('store'); document.getElementById('sec-products')?.scrollIntoView({ behavior: 'smooth' }); }}
          >
            <span>🛒</span> Store
          </button>
          <button
            className={`uni-tab-btn ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => { setActiveTab('updates'); document.getElementById('sec-knowledge')?.scrollIntoView({ behavior: 'smooth' }); }}
          >
            <span>📈</span> Updates
          </button>
          <button
            className={`uni-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => { setActiveTab('about'); document.getElementById('sec-about')?.scrollIntoView({ behavior: 'smooth' }); }}
          >
            <span>ℹ️</span> About
          </button>
        </nav>

        <div className="uni-nav-actions">
          <button
            className="uni-icon-btn"
            title="Search"
            onClick={() => { chatInputRef.current?.focus(); }}
          >
            🔍
          </button>

          <button
            className="uni-icon-btn"
            title="Shopping Cart"
            onClick={() => setCartOpen(true)}
          >
            🛒
            {cartItemCount > 0 && <span className="uni-cart-badge">{cartItemCount}</span>}
          </button>

          {user ? (
            <Link to="/admin" className="uni-icon-btn" title="Studio Dashboard">
              👤
            </Link>
          ) : (
            <Link to="/login" className="uni-icon-btn" title="Sign In">
              👤
            </Link>
          )}
        </div>
      </header>

      {/* 2. MAIN TWO-COLUMN LAYOUT */}
      <main className="uni-grid">
        {/* LEFT / CENTER COLUMN: AI Assistant, Explore & Buy, Featured Products */}
        <section className="uni-main-col">
          {/* A. HERO AI CHATBOT CARD */}
          <div className="uni-hero-card">
            <div className="uni-hero-wave" aria-hidden="true" />
            <div className="uni-hero-content">
              {/* Left: 3D Dotted Persona Particle Ball */}
              <div className="uni-ball-wrap">
                <PersonaBall
                  mode={chatMode}
                  impulse={chatImpulse}
                  width={230}
                  height={230}
                  dotColor={[99, 102, 241]}
                  glowColor={[168, 85, 247]}
                  lightTheme={true}
                />
              </div>

              {/* Right: Greetings, Prompt Chips, and Interactive Input */}
              <div className="uni-hero-info">
                <span className="uni-badge-ai">✨ AI Assistant</span>
                <h1 className="uni-hero-title">
                  Hi! Ask me <span className="uni-grad-text">anything.</span>
                </h1>
                <p className="uni-hero-sub">
                  Get answers about my research, projects, recommendations, or explore products from the store.
                </p>

                {/* Prompt Chips */}
                <div className="uni-chips-row">
                  <button className="uni-prompt-chip" onClick={() => handleChipClick('Tell me about your projects')}>
                    📁 My Projects
                  </button>
                  <button className="uni-prompt-chip" onClick={() => handleChipClick('What books do you recommend?')}>
                    📖 Recommend a Book
                  </button>
                  <button className="uni-prompt-chip" onClick={() => handleChipClick("What's in the store?")}>
                    🛒 What's in the Store?
                  </button>
                  <button className="uni-prompt-chip" onClick={() => handleChipClick('Can you give tech advice on IoT and AI?')}>
                    📈 Tech Advice
                  </button>
                </div>

                {/* Floating Chat Input Box */}
                <form className="uni-chat-form" onSubmit={handleChatSubmit}>
                  <div className="uni-chat-box">
                    <span style={{ fontSize: '1.1rem', color: '#6366f1' }}>✨</span>
                    <input
                      ref={chatInputRef}
                      type="text"
                      placeholder="Ask me anything about my research, projects, products, or tech..."
                      value={chatInput}
                      onChange={e => {
                        setChatInput(e.target.value);
                        setChatImpulse(0.25);
                      }}
                    />
                    <button
                      type="button"
                      style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: '1.1rem', color: '#64748b' }}
                      title="Voice input"
                      onClick={() => handleChipClick('Explain your key research findings')}
                    >
                      🎙️
                    </button>
                    <button
                      type="submit"
                      className="uni-chat-send"
                      disabled={chatBusy || !chatInput.trim()}
                      title="Send message"
                    >
                      →
                    </button>
                  </div>
                </form>

                {/* Live Output Box when answer is present */}
                {(chatAnswer || chatBusy) && (
                  <div className="uni-chat-answer">
                    <p>
                      {chatAnswer || 'Thinking and searching my notes…'}
                    </p>
                    {chatSources.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: '.78rem', color: '#6366f1' }}>
                        Sources: {chatSources.join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* B. EXPLORE & BUY CATEGORY CARDS */}
          <div className="uni-section" id="sec-explore">
            <div className="uni-sec-header">
              <div>
                <h2>Explore & Buy</h2>
                <p>Books, tools, components, and digital resources I recommend.</p>
              </div>
              <button className="uni-sec-link" onClick={() => setSelectedCat('All')}>
                View Store →
              </button>
            </div>

            <div className="uni-cats-grid">
              <div className="uni-cat-card" onClick={() => setSelectedCat('Books')}>
                <div className="uni-cat-icon books">📖</div>
                <div className="uni-cat-text">
                  <strong>Books</strong>
                  <span>Tech, product, AI & more</span>
                </div>
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
              </div>

              <div className="uni-cat-card" onClick={() => setSelectedCat('Hardware')}>
                <div className="uni-cat-icon hardware">🖲️</div>
                <div className="uni-cat-text">
                  <strong>Hardware & IoT</strong>
                  <span>ESP32, sensors, modules</span>
                </div>
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
              </div>

              <div className="uni-cat-card" onClick={() => setSelectedCat('Digital')}>
                <div className="uni-cat-icon digital">💻</div>
                <div className="uni-cat-text">
                  <strong>Digital Products</strong>
                  <span>Templates, code, tools</span>
                </div>
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
              </div>

              <div className="uni-cat-card" onClick={() => setSelectedCat('Books')}>
                <div className="uni-cat-icon learning">🎓</div>
                <div className="uni-cat-text">
                  <strong>Learning Resources</strong>
                  <span>Guides, notes, roadmaps</span>
                </div>
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
              </div>
            </div>
          </div>

          {/* C. FEATURED PRODUCTS (STORE) */}
          <div className="uni-section" id="sec-products">
            <div className="uni-sec-header">
              <div>
                <h2>Featured Products</h2>
                <p>Handpicked items for learning, building, and productivity.</p>
              </div>
              <button className="uni-sec-link" onClick={() => setSelectedCat('All')}>
                See All Products →
              </button>
            </div>

            <div className="uni-products-grid">
              {filteredProducts.map(prod => (
                <div key={prod.id} className="uni-prod-card">
                  <div className="uni-prod-img-wrap">
                    <img src={prod.image} alt={prod.title} className="uni-prod-img" />
                    <span className="uni-prod-badge">{prod.tag}</span>
                  </div>

                  <div className="uni-prod-body">
                    <h4 className="uni-prod-title">{prod.title}</h4>
                    <p className="uni-prod-desc">{prod.desc}</p>

                    <div className="uni-prod-foot">
                      <span className="uni-prod-price">₹{prod.price}</span>
                      <button
                        className="uni-prod-btn"
                        onClick={() => addToCart(prod)}
                      >
                        🛒 Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: MEMBER PROFILE SIDEBAR */}
        <aside className="uni-sidebar-card" id="sec-about">
          <h2 className="uni-side-name">{memberName}</h2>
          <p className="uni-side-role">{memberRole}</p>
          <p className="uni-side-bio">{memberBio}</p>

          <div className="uni-side-actions">
            <button
              className="uni-btn-persona"
              onClick={() => {
                chatInputRef.current?.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Open Persona ↗
            </button>
            <button
              className="uni-btn-talk"
              onClick={() => setTalkOpen(!talkOpen)}
            >
              💬 Talk to me
            </button>
          </div>

          {talkOpen && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '12px 14px', marginBottom: 16 }}>
              <strong style={{ fontSize: '.86rem', display: 'block', marginBottom: 4 }}>Contact Directly:</strong>
              {memberEmail && (
                <div style={{ fontSize: '.84rem', margin: '4px 0' }}>
                  Email: <a href={`mailto:${memberEmail}`}>{memberEmail}</a>
                </div>
              )}
              {memberPhone && (
                <div style={{ fontSize: '.84rem', margin: '4px 0' }}>
                  Phone: <a href={`tel:${memberPhone}`}>{memberPhone}</a>
                </div>
              )}
            </div>
          )}

          <div className="uni-side-divider" />

          {/* Expertise */}
          <h3 className="uni-side-sec-title">⚡ Expertise</h3>
          <div className="uni-expertise-chips">
            {memberExpertise.map(exp => (
              <span key={exp} className="uni-chip-blue">{exp}</span>
            ))}
          </div>

          {/* Education */}
          <h3 className="uni-side-sec-title">🎓 Education</h3>
          <div className="uni-education-item">
            {p?.education?.length ? (
              p.education.map((edu, idx) => (
                <div key={idx} style={{ marginBottom: 6 }}>
                  <strong>{[edu.qualification, edu.specialization].filter(Boolean).join(', ')}</strong>
                  {edu.institution && <div style={{ color: '#64748b', fontSize: '.82rem' }}>{edu.institution}</div>}
                </div>
              ))
            ) : (
              <p style={{ margin: 0 }}>
                B.Tech, Computer Science and Engineering (Artificial Intelligence), Arya Institute of Engineering Technology &amp; Management, Jaipur
              </p>
            )}
          </div>

          <div className="uni-side-divider" />

          {/* Information & Knowledge */}
          <div id="sec-knowledge">
            <h3 className="uni-side-sec-title">ℹ️ Information &amp; Knowledge</h3>
            <div className="uni-knowledge-card">
              <div className="uni-kc-top">
                <h4 className="uni-kc-title">Technology &amp; Innovation Knowledge Sharing</h4>
                <span className="uni-kc-price">INR 499</span>
              </div>
              <p className="uni-kc-desc">
                Sharing practical knowledge, insights, and experiences in Artificial Intelligence, Machine Learning, IoT, Computer Vision, Software Development, SaaS, and emerging technologies.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.82rem', color: '#64748b' }}>
                <span style={{ color: '#f59e0b' }}>★★★★☆ Your rating</span>
                <span>No ratings yet</span>
              </div>
            </div>
          </div>

          {/* Contributions Categories */}
          <div className="uni-contributions-list">
            <div className="uni-contrib-item">
              <span className="uni-contrib-icon">📄</span>
              <div className="uni-contrib-text">
                <strong>Content</strong>
                <span>Contribute educational content</span>
              </div>
            </div>
            <div className="uni-contrib-item">
              <span className="uni-contrib-icon">💡</span>
              <div className="uni-contrib-text">
                <strong>Advice &amp; Suggestions</strong>
                <span>Offer technology-related advice and suggestions</span>
              </div>
            </div>
            <div className="uni-contrib-item">
              <span className="uni-contrib-icon">👥</span>
              <div className="uni-contrib-text">
                <strong>In-Person Discussions</strong>
                <span>Participate in discussions</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* 3. SLIDE-OVER SHOPPING CART DRAWER */}
      {cartOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 90 }}
            onClick={() => setCartOpen(false)}
          />
          <div className="uni-cart-drawer">
            <div className="uni-cart-head">
              <h3>Shopping Cart ({cartItemCount})</h3>
              <button
                className="btn small"
                onClick={() => setCartOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            <div className="uni-cart-items">
              {cart.map(item => (
                <div key={item.id} className="uni-cart-item">
                  <img src={item.image} alt={item.title} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '.88rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </strong>
                    <span style={{ fontSize: '.82rem', color: '#64748b' }}>₹{item.price} each</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn small"
                      style={{ padding: '2px 8px' }}
                      onClick={() => {
                        setCart(c => c.map(i => i.id === item.id ? { ...i, count: Math.max(0, i.count - 1) } : i).filter(i => i.count > 0));
                      }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '.88rem', fontWeight: 600 }}>{item.count}</span>
                    <button
                      className="btn small"
                      style={{ padding: '2px 8px' }}
                      onClick={() => {
                        setCart(c => c.map(i => i.id === item.id ? { ...i, count: i.count + 1 } : i));
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              {!cart.length && (
                <p className="muted" style={{ textAlign: 'center', padding: '30px 0' }}>Your cart is empty.</p>
              )}
            </div>

            <div className="uni-cart-foot">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ color: '#64748b', fontSize: '.95rem' }}>Subtotal</span>
                <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>₹{cartTotal}</strong>
              </div>
              <button
                className="btn primary block"
                onClick={() => {
                  alert(`Thank you for your order! Total ₹${cartTotal}. A member will connect with you.`);
                  setCartOpen(false);
                }}
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
