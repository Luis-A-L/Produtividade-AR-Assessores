// Script para diagnosticar e limpar entradas duplicadas no banco Supabase
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORIGEM_SUFFIXES = ['_cv', '_rcv', '_dcv', '_cr', '_rcr', '_dcr'];

async function main() {
  console.log('Buscando todas as entradas...');
  const { data: allEntries, error } = await supabase
    .from('productivity_entries')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Erro ao buscar:', error);
    return;
  }

  console.log(`Total de entradas no banco: ${allEntries.length}`);

  // Separar entradas com sufixo de origem das sem sufixo
  const suffixedEntries = allEntries.filter((e: any) => 
    ORIGEM_SUFFIXES.some(s => e.assessor_id.endsWith(s))
  );
  const cleanEntries = allEntries.filter((e: any) => 
    !ORIGEM_SUFFIXES.some(s => e.assessor_id.endsWith(s))
  );

  console.log(`\nEntradas COM sufixo de origem: ${suffixedEntries.length}`);
  console.log(`Entradas SEM sufixo: ${cleanEntries.length}`);

  if (suffixedEntries.length > 0) {
    console.log('\nExemplos de entradas com sufixo:');
    suffixedEntries.slice(0, 10).forEach((e: any) => {
      console.log(`  ${e.assessor_id} | ${e.date} | count=${e.count}`);
    });

    console.log('\nDeletando entradas com sufixo de origem...');
    const idsToDelete = suffixedEntries.map((e: any) => e.id);
    
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const chunk = idsToDelete.slice(i, i + 100);
      const { error: delError } = await supabase
        .from('productivity_entries')
        .delete()
        .in('id', chunk);
      if (delError) {
        console.error('Erro ao deletar:', delError);
      } else {
        console.log(`  Deletados ${chunk.length} registros (lote ${Math.floor(i/100)+1})`);
      }
    }
    console.log('Limpeza concluída!');
  } else {
    console.log('\nNenhuma entrada com sufixo encontrada. Banco está limpo.');
  }
}

main().catch(console.error);
