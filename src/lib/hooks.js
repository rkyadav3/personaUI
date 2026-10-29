import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Load data from an admin op. Returns { data, loading, error, reload, setData }. */
export function useOp(op, args, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(op, args);
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (e) { if (id === seq.current) setState({ data: null, loading: false, error: e.message }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, JSON.stringify(args), ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: data => setState(s => ({ ...s, data })) };
}

export const useTopics = () => useOp('topics.list');
export const useFolders = () => useOp('folders.all');
