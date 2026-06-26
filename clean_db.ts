// Script para diagnosticar e limpar entradas duplicadas no banco Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

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
    ORIGEM_SUFFIXES.some(s => e.estagiario_id.endsWith(s))
  );
  const cleanEntries = allEntries.filter((e: any) => 
    !ORIGEM_SUFFIXES.some(s => e.estagiario_id.endsWith(s))
  );

  console.log(`\nEntradas COM sufixo de origem: ${suffixedEntries.length}`);
  console.log(`Entradas SEM sufixo: ${cleanEntries.length}`);

  if (suffixedEntries.length > 0) {
    console.log('\nExemplos de entradas com sufixo:');
    suffixedEntries.slice(0, 10).forEach((e: any) => {
      console.log(`  ${e.estagiario_id} | ${e.date} | count=${e.count}`);
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
