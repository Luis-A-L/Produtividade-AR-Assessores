/**
 * sync_from_sheet.ts
 *
 * Lê a aba "Controle" do Google Sheets e importa os dados
 * diretamente para o banco Supabase.
 *
 * A planilha deve ter compartilhamento público (Leitor).
 * Formato esperado: formato DETALHADO (colunas = nomes dos assessores, linhas = datas)
 *
 * Uso: npx tsx sync_from_sheet.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ─── CONFIGURAÇÕES ───────────────────────────────────────────
const SPREADSHEET_ID = '17MlkyQC2GnrK2f-mxZQZusv7hORoBZRQpcVAT6bbRIQ';
const SHEET_NAME     = 'Dados-GR';                      // Nome exato da aba
const DATE_FROM      = '2026-06-01';
const DATE_TO        = '2026-06-19';

const SKIP_IDS = new Set(['livre_1', 'pietro']); // ignorados conforme solicitação

// ─── SUPABASE ────────────────────────────────────────────────
let SUPABASE_URL = process.env.VITE_SUPABASE_URL;
let SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

try {
  const env = readFileSync('.env', 'utf8');
  const vars: Record<string, string> = {};
  env.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const k = trimmed.substring(0, eqIdx).trim();
    const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    vars[k] = v;
  });
  if (vars['VITE_SUPABASE_URL']) SUPABASE_URL = vars['VITE_SUPABASE_URL'];
  if (vars['VITE_SUPABASE_ANON_KEY']) SUPABASE_KEY = vars['VITE_SUPABASE_ANON_KEY'];
} catch (e) {
  // Ignora se o .env não existir
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Credenciais Supabase não encontradas no .env nem no ambiente.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── HELPERS ─────────────────────────────────────────────────
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const parseDateBR = (s: string): string | null => {
  const cleaned = s.trim();
  // DD/MM/YYYY
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return null;
};

// ─── BUSCAR CSV PÚBLICO ───────────────────────────────────────
const fetchSheetCsv = async (): Promise<string> => {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
  console.log(`\n📥 Buscando CSV da planilha (aba "${SHEET_NAME}")...`);
  console.log(`   URL: ${url}\n`);
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Erro HTTP ${res.status} ao buscar planilha. Verifique se a planilha está compartilhada publicamente.`);
  }
  return res.text();
};

// ─── PARSEAR CSV NO FORMATO DETALHADO ────────────────────────
type Entry = { assessor_id: string; date: string; count: number };

const parseCsv = (csv: string, assessorMap: Map<string, string>): Entry[] => {
  const firstLine = csv.split('\n')[0] || '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const rawLines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (rawLines.length < 2) throw new Error('CSV muito pequeno, verifique a aba "Controle".');

  const tokenize = (line: string): string[] => {
    const tokens: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === delim && !inQ) {
        tokens.push(cur.trim()); cur = '';
      } else {
        cur += c;
      }
    }
    tokens.push(cur.trim());
    return tokens;
  };

  let headerRowIdx = -1;
  let dateColIdx   = -1;
  let userCols: { colIdx: number; id: string }[] = [];

  for (let r = 0; r < Math.min(rawLines.length, 10); r++) {
    const cells = tokenize(rawLines[r]);
    let matches = 0;
    let tmpDateCol = -1;
    const tmpUserCols: { colIdx: number; id: string }[] = [];

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const norm = normalize(cell);
      if (!norm) continue;

      if (norm.includes('data') || norm.includes('date') || norm.includes('dia')) {
        tmpDateCol = c;
      } else {
        const id = assessorMap.get(norm);
        if (id) {
          matches++;
          tmpUserCols.push({ colIdx: c, id });
        }
      }
    }

    if (matches >= 2) {
      headerRowIdx = r;
      dateColIdx   = tmpDateCol === -1 ? 0 : tmpDateCol;
      userCols     = tmpUserCols;
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.warn('⚠️  Não encontrei cabeçalho com nomes dos assessores. Tentando estratégia fallback...');
    const cells0 = tokenize(rawLines[0]);
    dateColIdx = 0;
    headerRowIdx = 0;
    for (let c = 0; c < cells0.length; c++) {
      const norm = normalize(cells0[c]);
      const id = assessorMap.get(norm);
      if (id) userCols.push({ colIdx: c, id });
    }
  }

  if (userCols.length === 0) {
    throw new Error(
      `Não encontrei colunas de assessores na aba "${SHEET_NAME}". ` +
      `Verifique se os nomes na planilha coincidem com os cadastrados no banco.`
    );
  }

  console.log(`✅ Cabeçalho encontrado na linha ${headerRowIdx + 1}`);
  console.log(`   Coluna de datas: ${dateColIdx}`);
  console.log(`   Colunas de assessores detectadas: ${userCols.map(u => u.id).join(', ')}`);

  const entries: Entry[] = [];
  let skippedRows = 0;

  for (let r = headerRowIdx + 1; r < rawLines.length; r++) {
    const cells = tokenize(rawLines[r]);
    const rawDate = cells[dateColIdx] || '';
    const dateISO = parseDateBR(rawDate);

    if (!dateISO) { skippedRows++; continue; }
    if (dateISO < DATE_FROM || dateISO > DATE_TO) continue;

    for (const { colIdx, id } of userCols) {
      if (SKIP_IDS.has(id)) continue;
      const raw = (cells[colIdx] || '').trim().replace(',', '.');
      const count = parseInt(raw, 10);
      if (!isNaN(count) && count > 0) {
        entries.push({ assessor_id: id, date: dateISO, count });
      }
    }
  }

  if (skippedRows > 50) {
    console.warn(`⚠️  ${skippedRows} linhas ignoradas (sem data válida)`);
  }

  return entries;
};

// ─── MAIN ─────────────────────────────────────────────────────
const main = async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   SYNC: Aba "Dados-GR" → Supabase               ║');
  console.log(`║   Período: ${DATE_FROM} a ${DATE_TO}     ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  // 1. Buscar assessores do banco
  const { data: assessores, error: eErr } = await sb
    .from('assessores')
    .select('id, name');
  if (eErr) { console.error('❌ Erro ao buscar assessores:', eErr); process.exit(1); }

  // Mapa: nome normalizado → id
  const assessorMap = new Map<string, string>();
  assessores?.forEach((e: any) => assessorMap.set(normalize(e.name), e.id));

  console.log('👥 Assessores no banco:');
  assessores?.forEach((e: any) => console.log(`   ${e.id} → "${e.name}"`));
  console.log('');

  // 2. Buscar CSV da planilha
  const csv = await fetchSheetCsv();

  // 3. Parsear
  const entries = parseCsv(csv, assessorMap);

  if (entries.length === 0) {
    console.warn('⚠️  Nenhuma entrada encontrada no período. Verifique se a planilha está compartilhada e se os nomes batem.');
    process.exit(0);
  }

  // 4. Resumo antes de inserir
  console.log(`\n📊 Resumo por data:`);
  const byDate = new Map<string, number>();
  entries.forEach(e => byDate.set(e.date, (byDate.get(e.date) || 0) + e.count));
  [...byDate.entries()].sort().forEach(([d, t]) => console.log(`   ${d}: ${t} processos`));

  const grandTotal = entries.reduce((s, e) => s + e.count, 0);
  console.log(`\n   TOTAL: ${grandTotal} processos em ${entries.length} entradas`);
  console.log(`   Período: ${DATE_FROM} a ${DATE_TO}`);

  // 5. Upsert no Supabase
  console.log(`\n⏳ Inserindo no Supabase...`);
  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const { error } = await sb
      .from('productivity_entries')
      .upsert(chunk, { onConflict: 'assessor_id,date' });
    if (error) {
      console.error(`❌ Erro no chunk ${i}-${i + CHUNK}:`, error);
    } else {
      inserted += chunk.length;
      process.stdout.write(`   ${inserted}/${entries.length} entradas...       \r`);
    }
  }

  console.log(`\n\n✅ CONCLUÍDO! ${inserted} entradas upsertadas no banco.`);
  console.log(`   Grand total: ${grandTotal} processos inseridos.`);
};

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message || err);
  process.exit(1);
});
