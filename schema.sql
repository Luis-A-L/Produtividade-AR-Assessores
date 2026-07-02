-- Drop tables if they exist (para resetar se necessário)
-- DROP TABLE IF EXISTS productivity_entries;
-- DROP TABLE IF EXISTS assessores;
-- DROP TABLE IF EXISTS settings;

-- 1. Tabela: settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabela: assessores
CREATE TABLE IF NOT EXISTS assessores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT NOT NULL CHECK (sector IN ('público', 'privado 1', 'privado 2', 'privado 3', 'crime')),
    daily_goal INTEGER DEFAULT 25,
    matricula TEXT DEFAULT '',
    semana_prova BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Tabela: productivity_entries
CREATE TABLE IF NOT EXISTS productivity_entries (
    id TEXT PRIMARY KEY, -- formato: assessorId_date
    assessor_id TEXT NOT NULL REFERENCES assessores(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    type_breakdown JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(assessor_id, date)
);

-- Desativar RLS para permitir desenvolvimento e testes locais
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE assessores DISABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_entries DISABLE ROW LEVEL SECURITY;
