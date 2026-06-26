// Script para ver entradas de Ademar no banco
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  console.log('Buscando entradas de junho 2026...');
  const { data, error } = await supabase
    .from('productivity_entries')
    .select('*')
    .gte('date', '2026-06-01')
    .order('estagiario_id')
    .order('date');

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log(`\nTotal de entradas em junho: ${data.length}`);
  
  // Agrupar por estagiário
  const byEstag: Record<string, { date: string; count: number }[]> = {};
  for (const row of data) {
    if (!byEstag[row.estagiario_id]) byEstag[row.estagiario_id] = [];
    byEstag[row.estagiario_id].push({ date: row.date, count: row.count });
  }

  console.log('\n=== DADOS POR ESTAGIÁRIO ===');
  for (const [id, entries] of Object.entries(byEstag)) {
    const total = entries.reduce((s, e) => s + e.count, 0);
    console.log(`\n${id} (total: ${total})`);
    entries.forEach(e => console.log(`  ${e.date}: count=${e.count}`));
  }
}

main().catch(console.error);
