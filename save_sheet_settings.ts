// Script para salvar a aba alvo nas configurações do banco de dados
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://lqmjfjusljxduxwkoqhc.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxbWpmanVzbGp4ZHV4d2tvcWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTQyNjQsImV4cCI6MjA5ODU5MDI2NH0.EjdUNiNDuDUWebMVOJmnqF2plkDtvrJo-2yJLx_heZk'
);

async function main() {
  // 1. Ler configuração atual
  const { data: existing, error: readErr } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'googleSheet')
    .single();

  if (readErr) { console.error('Erro ao ler settings:', readErr); return; }

  const currentValue = existing?.value || {};
  console.log('Configuração atual:', JSON.stringify(currentValue, null, 2));

  // 2. Atualizar URL para a aba de setembro
  const newValue = {
    ...currentValue,
    url: 'https://docs.google.com/spreadsheets/d/17MlkyQC2GnrK2f-mxZQZusv7hORoBZRQpcVAT6bbRIQ/edit?gid=1415874718#gid=1415874718',
  };

  const { error: updateErr } = await supabase
    .from('settings')
    .update({ value: newValue })
    .eq('key', 'googleSheet');

  if (updateErr) {
    console.error('Erro ao atualizar settings:', updateErr);
    return;
  }

  console.log('\n✅ Configuração atualizada com sucesso!');
  console.log('Novo valor:', JSON.stringify(newValue, null, 2));
}

main().catch(console.error);
