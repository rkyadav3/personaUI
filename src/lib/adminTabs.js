import { useSearchParams } from 'react-router-dom';

export function readAdminTab(params, { values, defaultValue, parameter = 'tab', aliases = {} }) {
  const requested = params.get(parameter);
  const value = Object.hasOwn(aliases, requested) ? aliases[requested] : requested;
  return values.includes(value) ? value : defaultValue;
}

export function updateAdminTab(params, value, parameter = 'tab') {
  const next = new URLSearchParams(params);
  next.set(parameter, value);
  return next;
}

/** URL-backed local tabs support direct links, refresh and browser Back/Forward. */
export function useAdminTab(options) {
  const [params, setParams] = useSearchParams();
  const value = readAdminTab(params, options);
  const setValue = next => {
    if (next === value || !options.values.includes(next)) return;
    setParams(previous => updateAdminTab(previous, next, options.parameter));
  };
  return [value, setValue];
}
