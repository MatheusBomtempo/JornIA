-- Marca quando um admin/manager resetou a senha de um usuário e mandou por
-- e-mail (ver /api/users/:id/reset-password) — só timestamp, nunca a senha.
ALTER TABLE "users" ADD COLUMN "password_reset_at" TIMESTAMPTZ(6);
