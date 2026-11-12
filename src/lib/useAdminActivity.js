import { useEffect, useState } from 'react';
import { api } from './api.js';
const IDLE_MS = 5 * 60 * 1000;
export function useAdminActivity(user, call = api) {
  const [state, setState] = useState({ summary: null, error: '', version: 0 });
  useEffect(() => {
    if (!user?.id || user.isSuperAdmin) return;
    let active = true, pending = false, resumeQueued = false, away = false, lastInput = Date.now();
    function settled() {
      pending = false;
      if (resumeQueued && active) { resumeQueued = false; resume(); }
    }
    async function resume() {
      if (!active || document.hidden) return;
      if (pending) { resumeQueued = true; return; }
      pending = true;
      try { const summary = await call('activity.resume'); if (active) setState(current => ({ summary, error: '', version: current.version + 1 })); }
      catch (error) { if (active) setState(current => ({ ...current, error: error.message })); }
      finally { settled(); }
    }
    function input() {
      const returning = away || Date.now() - lastInput >= IDLE_MS;
      lastInput = Date.now(); away = false;
      if (returning) resume();
    }
    function visibility() { if (document.hidden) away = true; else input(); }
    resume();
    const timer = setInterval(() => {
      if (Date.now() - lastInput >= IDLE_MS || document.hidden) { away = true; return; }
      if (pending) return;
      pending = true;
      call('activity.touch').catch(error => { if (active) setState(current => ({ ...current, error: error.message })); }).finally(settled);
    }, 60000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerdown', input); window.addEventListener('keydown', input);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointerdown', input); window.removeEventListener('keydown', input); };
  }, [user?.id, user?.isSuperAdmin, call]);
  return state;
}
