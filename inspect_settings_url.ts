import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://lqmjfjusljxduxwkoqhc.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxbWpmanVzbGp4ZHV4d2tvcWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTQyNjQsImV4cCI6MjA5ODU5MDI2NH0.EjdUNiNDuDUWebMVOJmnqF2plkDtvrJo-2yJLx_heZk'
);

async function main() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'googleSheet')
    .single();

  if (error) { console.error('Error fetching settings:', error); return; }
  console.log('Google Sheet Settings in DB:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
