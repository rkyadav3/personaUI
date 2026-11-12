import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('retrieval migration gates both search modes by current source publication and tenant', () => {
  const sql = fs.readFileSync('supabase/knowledge-visibility.sql', 'utf8');
  assert.match(sql, /f\.id = c\.source_id and f\.owner_id = p_owner and f\.status = 'published'/);
  assert.match(sql, /p\.id = c\.source_id and p\.owner_id = p_owner and p\.status = 'published'/);
  assert.match(sql, /from eligible c where c\.embedding is not null/);
  assert.match(sql, /from eligible c, q/);
  assert.match(sql, /from fused f join eligible c/);
  assert.match(sql, /after update of status or delete on public\.files/);
  assert.match(sql, /after update of status or delete on public\.posts/);
  assert.match(sql, /owner_id = old\.owner_id and source_key = tg_argv\[0\]/);
  assert.match(sql, /from public, anon, authenticated/);
});
