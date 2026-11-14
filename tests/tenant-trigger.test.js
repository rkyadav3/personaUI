import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('tenant trigger handles uploads without arguments and still blocks foreign references', async () => {
  const database = new PGlite();
  try {
    const migration = await readFile(new URL('../supabase/tenant-boundaries.sql', import.meta.url), 'utf8');
    const trigger = migration.match(/create or replace function public\.check_tenant_reference\(\)[\s\S]*?end \$\$;/i)?.[0];
    assert.ok(trigger, 'Test must execute the migration’s actual trigger function.');
    const repair = await readFile(new URL('../supabase/tenant-trigger-repair.sql', import.meta.url), 'utf8');
    assert.equal(repair.match(/create or replace function public\.check_tenant_reference\(\)[\s\S]*?end \$\$;/i)?.[0].replace(/\r/g, ''), trigger.replace(/\r/g, ''), 'Targeted repair must install the same tested function.');
    await database.exec(`
      create table assets(id bigint primary key, owner_id uuid not null, name text);
      create table folders(id bigint primary key, owner_id uuid not null);
      create table files(id bigint primary key, owner_id uuid not null, folder_id bigint);
      create table chunks(id bigint primary key, owner_id uuid not null, source_type text, source_id bigint);
      ${trigger}
      create trigger asset_boundary before insert or update on assets for each row execute function check_tenant_reference();
      create trigger file_boundary before insert or update on files for each row execute function check_tenant_reference('folder_id:folders');
      create trigger chunk_boundary before insert or update on chunks for each row execute function check_tenant_reference();
      insert into folders values (1,'${owner}'),(2,'${other}');
    `);
    await database.exec(`insert into assets values(1,'${owner}','Book.pdf'); update assets set name='Guide.pdf' where id=1;`);
    await assert.rejects(database.exec(`update assets set owner_id='${other}' where id=1;`), /ownership cannot be changed/);
    await database.exec(`insert into files values(1,'${owner}',null),(2,'${owner}',1);`);
    await assert.rejects(database.exec(`insert into files values(3,'${owner}',2);`), /not available in this account/);
    await database.exec(`insert into chunks values(1,'${owner}','file',1);`);
    await assert.rejects(database.exec(`insert into chunks values(2,'${other}','file',1);`), /not available in this account/);
    const result = await database.query('select name from assets where id=1');
    assert.equal(result.rows[0].name, 'Guide.pdf');
  } finally { await database.close(); }
});
