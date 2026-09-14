-- JornIA — bootstrap do banco de desenvolvimento (alternativa ao Docker).
--
-- Rode UMA vez como superusuário (o psql vai pedir a senha do 'postgres'):
--   psql -U postgres -h localhost -f scripts/init-db.sql
--
-- Cria o papel 'jornia' (senha 'jornia') e o banco 'jornia'. Idempotente:
-- pode rodar de novo sem erro se já existirem.

SELECT 'CREATE ROLE jornia LOGIN PASSWORD ''jornia'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jornia')\gexec

SELECT 'CREATE DATABASE jornia OWNER jornia'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jornia')\gexec

-- Garante que o usuário 'jornia' consegue criar as tabelas no schema public.
\connect jornia
GRANT ALL ON SCHEMA public TO jornia;
ALTER SCHEMA public OWNER TO jornia;
