-- Job de retenção de dados: mora inteiro no banco (função PL/pgSQL) para que
-- possa ser agendado nativamente via pg_cron/pgAgent num host que suporte
-- (ex.: `SELECT cron.schedule('cleanup-posts', '0 3 * * *', 'SELECT cleanup_expired_posts()')`)
-- sem precisar mudar nenhuma linha de código do app. No Postgres local do
-- Windows (sem pg_cron disponível), quem aciona essa função periodicamente é
-- o próprio app — ver src/lib/services/retention.ts — mas a regra de negócio
-- (o que apagar, quando, e o que preservar como log) fica só aqui.
--
-- Regras (pedidas pelo usuário, evitar acúmulo de dados pesados no banco):
--   - Post publicado:            2 dias depois de publicado -> apaga.
--   - Post em revisão ou falhou: 3 dias sem aprovação        -> apaga.
-- "Apagar" nunca mexe no Instagram — só remove do nosso banco (fotos,
-- versões, decisões, publicações). Antes de apagar, grava uma linha mínima
-- em post_audit_log (título, status, autor, datas) para auditoria futura.
CREATE OR REPLACE FUNCTION cleanup_expired_posts() RETURNS void AS $$
DECLARE
  expired RECORD;
BEGIN
  FOR expired IN
    SELECT p.id, p.status, p.created_at, p.updated_at, u.name AS author_name
    FROM posts p
    JOIN users u ON u.id = p.created_by
    WHERE
      (p.status = 'published' AND p.updated_at < now() - interval '2 days')
      OR
      (p.status IN ('in_review', 'failed') AND p.updated_at < now() - interval '3 days')
  LOOP
    INSERT INTO post_audit_log
      (id, post_id, title, status, author_name, created_at, published_at, purged_at)
    SELECT
      gen_random_uuid(),
      expired.id,
      (SELECT v.title FROM post_versions v
         WHERE v.post_id = expired.id
         ORDER BY v.version_number DESC LIMIT 1),
      expired.status,
      expired.author_name,
      expired.created_at,
      (SELECT pub.published_at FROM publications pub
         JOIN post_versions v2 ON v2.id = pub.post_version_id
         WHERE v2.post_id = expired.id AND pub.status = 'published'
         ORDER BY pub.published_at DESC LIMIT 1),
      now();

    -- review_decisions/publications têm ON DELETE RESTRICT em post_version_id
    -- (de propósito, pra nunca sumir decisão/publicação por engano em uso
    -- normal) — aqui, na limpeza deliberada, apagamos na ordem certa.
    DELETE FROM review_decisions
      WHERE post_version_id IN (SELECT id FROM post_versions WHERE post_id = expired.id);
    DELETE FROM publications
      WHERE post_version_id IN (SELECT id FROM post_versions WHERE post_id = expired.id);
    -- post_versions e post_photos têm ON DELETE CASCADE a partir de posts.
    DELETE FROM posts WHERE id = expired.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
