// Answers strictly from retrieved passages. Uses a local Ollama model if LLM_URL is set,
// otherwise falls back to an extractive answer (no model needed).
const retrieval = require('./retrieval');
const NOT_FOUND = "I don't have anything about that in my research yet.";

exports.answer = async question => {
  const hits = retrieval.search(question);
  if (!hits.length) return { reply: NOT_FOUND, sources: [] };
  const sources = [...new Set(hits.map(h => h.source))];

  if (process.env.LLM_URL) {
    try {
      const context = hits.map((h, i) => `[${i + 1}] (${h.source}) ${h.text}`).join('\n\n');
      const res = await fetch(`${process.env.LLM_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'qwen2.5:1.5b',
          stream: false,
          messages: [
            { role: 'system', content: `You are the site owner speaking in first person. Answer ONLY using the context. If the context does not contain the answer, say exactly: "${NOT_FOUND}". Be concise.` },
            { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }
          ]
        })
      });
      const data = await res.json();
      if (data.message?.content) return { reply: data.message.content.trim(), sources };
    } catch (e) { /* fall through to extractive */ }
  }
  return { reply: hits[0].text.replace(/^#+\s*[^\n]*?\s{2,}|#+\s/g, '').replace(/#/g, '').trim().split(/(?<=[.!?])\s+/).slice(0, 3).join(' '), sources };
};
