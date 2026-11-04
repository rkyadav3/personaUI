// A query recorder for repository integration tests. No database or credentials are needed.
export function scriptedDatabase(...responses) {
  const calls = [];
  function request(table, initial = []) {
    const call = { table, steps: initial }; calls.push(call);
    let result;
    const query = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'range', 'single']) {
      query[method] = (...args) => { call.steps.push({ method, args }); return query; };
    }
    query.then = (resolve, reject) => {
      if (!result) {
        const index = responses.findIndex(r => r.table === table);
        if (index < 0) result = Promise.reject(new Error(`Unexpected query: ${table}`));
        else { const response = responses.splice(index, 1)[0]; result = Promise.resolve({ data: [], error: null, ...response }); }
      }
      return result.then(resolve, reject);
    };
    return query;
  }
  return { calls, from: table => request(table), rpc: (fn, params) => request(`rpc:${fn}`, [{ method: 'rpc', args: [params] }]) };
}
export const step = (call, method) => call.steps.find(s => s.method === method)?.args;
export const hasEq = (call, column, value) => call.steps.some(s => s.method === 'eq' && s.args[0] === column && s.args[1] === value);
