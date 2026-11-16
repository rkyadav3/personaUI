import React from 'react';
import { createRoot } from 'react-dom/client';
import ScaledPreview from '../../src/components/portfolio/ScaledPreview.jsx';

createRoot(document.getElementById('root')).render(<main style={{ width: 'min(600px,100%)' }}><ScaledPreview mobile={new URLSearchParams(location.search).has('mobile')}><div className="pf" style={{ height: 'calc(100vh + 120px)', background: '#f1f7f3' }}><h1>Preview content</h1><p>A page taller than its viewport should scroll inside the preview.</p></div></ScaledPreview></main>);
