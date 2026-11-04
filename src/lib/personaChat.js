export async function askPersona(slug, input, { signal, fetcher = fetch } = {}) {
  const message = typeof input === 'string' ? input.trim().slice(0, 500) : '';
  if (!message) throw new Error('Write a question first.');
  let response;
  try {
    response = await fetcher('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, message }), signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('The persona could not answer right now. Please try again.');
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'Please wait a moment before asking another question.' : 'The persona could not answer right now. Please try again.');
  let data;
  try { data = await response.json(); }
  catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('The persona could not answer right now. Please try again.');
  }
  if (typeof data?.reply !== 'string' || !data.reply.trim()) throw new Error('The persona returned an empty answer. Please try again.');
  const sources = Array.isArray(data.sources) ? [...new Set(data.sources.filter(source => typeof source === 'string').map(source => source.slice(0, 200)))].slice(0, 5) : [];
  return { reply: data.reply.trim().slice(0, 10000), sources };
}
