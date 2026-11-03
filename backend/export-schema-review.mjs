import 'dotenv/config';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  const {rows: tables} = await db.query(`SELECT c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition
    ORDER BY c.relname`);
  let md = '# CloudSphere — Tables and Columns\n\nRead from the local database. Monthly partition child tables are excluded; their columns are inherited from monitoring_log. Migration tracking tables, if present, are listed separately from application tables.\n\n';
  for (const t of tables) {
    const {rows: cols} = await db.query(`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS required, pg_get_expr(d.adbin,d.adrelid) AS default_value,
      a.attidentity AS identity, a.attgenerated AS generated
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY a.attnum`,[t.name]);
    const {rows: constraints} = await db.query(`SELECT pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=$1 ORDER BY con.contype,con.conname`,[t.name]);
    md += `## ${t.name}\n\n| Column | Data type | Required | Default / generated value |\n|---|---|---|---|\n`;
    for (const c of cols) {
      const value = c.identity ? 'Identity (auto-generated ID)' : (c.generated ? 'Generated: ' : '') + (c.default_value ?? '—');
      md += `| ${c.name} | ${c.type} | ${c.required?'Yes':'No'} | ${value.replaceAll('|','\\|').replaceAll('\n',' ')} |\n`;
    }
    if(constraints.length) md += '\nConstraints and keys:\n\n' + constraints.map(c=>'- `'+c.definition+'`').join('\n')+'\n';
    md+='\n';
    console.log(t.name+': '+cols.map(c=>c.name).join(', '));
  }
  writeFileSync('../../CloudSphere_Tables_and_Columns.md',md);
  console.log('Exported '+tables.length+' tables.');
} finally { await db.end(); }
