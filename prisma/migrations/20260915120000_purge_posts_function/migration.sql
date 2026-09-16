-- Substitui cleanup_expired_posts() por purge_posts(post_ids): quem decide
-- QUAIS posts estão expirados passa a ser o app (src/lib/services/retention.ts),
-- não mais o SQL. Motivo: apagar só a linha do banco não é mais suficiente —
-- as fotos/artes de cada post moram no storage (R2), e só o app consegue
-- chamar a API do R2 pra apagar o arquivo de verdade. Então o fluxo virou:
--   1. app pergunta ao banco quais posts já passaram do prazo (via Prisma,
--      mesma regra de antes: publicado há +2 dias, ou em revisão/falhou há +3);
--   2. app apaga do R2 as URLs de post_photos/post_versions desses posts;
--   3. só então app chama purge_posts(ids) pra remover as linhas do banco
--      (audit log + cascade), já sabendo que o storage foi limpo primeiro.
-- purge_posts() recebe os ids prontos — não recalcula "quem expirou" — pra
-- garantir que o mesmo conjunto de posts é usado nos passos 2 e 3.
DROP FUNCTION IF EXISTS cleanup_expired_posts();

CREATE OR REPLACE FUNCTION purge_posts(post_ids UUID[]) RETURNS void AS $$
DECLARE
  expired RECORD;
BEGIN
  FOR expired IN
    SELECT p.id, p.status, p.created_at, u.name AS author_name
    FROM posts p
    JOIN users u ON u.id = p.created_by
    WHERE p.id = ANY(post_ids)
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
