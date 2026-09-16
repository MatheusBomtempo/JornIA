-- JornAI — bootstrap do banco de desenvolvimento (alternativa ao Docker).
--
-- Rode UMA vez como superusuário (o psql vai pedir a senha do 'postgres'):
--   psql -U postgres -h localhost -f scripts/init-db.sql
--
-- Cria o papel 'jornai' (senha 'jornai') e o banco 'jornai'. Idempotente:
-- pode rodar de novo sem erro se já existirem.

SELECT 'CREATE ROLE jornai LOGIN PASSWORD ''jornai'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jornai')\gexec

SELECT 'CREATE DATABASE jornai OWNER jornai'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jornai')\gexec

-- Garante que o usuário 'jornai' consegue criar as tabelas no schema public.
\connect jornai
GRANT ALL ON SCHEMA public TO jornai;
ALTER SCHEMA public OWNER TO jornai;
