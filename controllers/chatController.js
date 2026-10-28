const llm = require('../services/llm');
exports.ask = async (req, res) => {
  const q = (req.body.message || '').toString().slice(0, 500).trim();
  if (!q) return res.status(400).json({ error: 'Empty message' });
  res.json(await llm.answer(q));
};
