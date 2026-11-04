import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still checking, null = signed out
  const refresh = useCallback(() => api('auth.me').then(r => setUser(r.user), () => setUser(null)), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const sync = () => api('auth.me').then(result => { if (active) setUser(result.user); }, () => {});
    window.addEventListener('studio-changed', sync);
    return () => { active = false; window.removeEventListener('studio-changed', sync); };
  }, [user?.id]);
  const logout = async () => { await api('auth.logout'); setUser(null); };
  return <Ctx.Provider value={{ user, setUser, logout }}>{children}</Ctx.Provider>;
}
