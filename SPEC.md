# Plataforma de publicação rápida no Instagram com IA — Especificação técnica

## Visão geral

Ferramenta web para uma redação de jornal publicar posts urgentes no feed do Instagram,
com o mínimo de fricção possível: jornalista manda a fonte (foto, texto ou link),
IA gera o texto (título, notícia curta, legenda, sugestão de texto da arte), o próprio
jornalista ajusta a foto e o texto dentro de um template fixo da marca, um editor/gerente
revisa (aprova, recusa, pede pra refazer com IA, ou edita manualmente) e só depois disso
o post vai pro Instagram.

**Não é** uma ferramenta de agendamento — é publicação imediata, sob demanda, a qualquer
hora. **Não há** geração de imagem por IA — a arte final é sempre a composição de uma foto
real (ajustada manualmente) sobre um template fixo. **Não há**, por enquanto, suporte a
Stories, vídeo ou múltiplas redes sociais — só feed do Instagram. Multi-rede/vídeo/Stories
ficam para uma v2.0.

## Stack recomendada

- **Frontend:** Next.js (React), web responsivo — mobile-first mas sem exigência de app nativo.
- **Editor de arte:** Fabric.js (canvas interativo, open source, MIT) — foto arrastável/com
  zoom dentro de uma área fixa, overlay do template travado, texto editável só no conteúdo.
- **Backend:** API própria (Next.js API routes ou serviço separado em Node).
- **Banco:** PostgreSQL.
- **Render final da arte:** Sharp (Node), server-side, a partir dos mesmos parâmetros
  salvos pelo editor (não a partir do canvas do navegador — garante qualidade e
  reprodutibilidade).
- **IA:** um modelo de texto (GPT-4o/Gemini/Claude) — só texto, sem visão nem geração de imagem.
- **Publicação:** Instagram Graph API (Meta), direto, sem biblioteca de terceiros.
- **Storage de mídia:** S3/R2/Supabase Storage (a arte final precisa estar numa URL pública
  HTTPS antes de publicar).

## Fluxo (state machine)

```
CAPTURA (jornalista) → texto/foto/link
   ↓
PROCESSANDO_IA (só texto: título, notícia curta, legenda, sugestão de texto da arte)
   ↓
EDITOR DE ARTE (Fabric.js) — jornalista ajusta foto (posição/zoom) e o texto sugerido
   ↓
EM_REVISAO (editor/gerente vê preview estilo Instagram)
   │
   ├── Aprovar  → publica no Instagram
   ├── Recusar  → arquiva com motivo
   ├── Refazer  → novo ciclo de IA (nova versão)
   └── Editar   → edição manual → volta pra revisão
```

Cada ciclo (IA ou edição manual) gera uma **nova versão**, nunca sobrescreve — isso dá
histórico/auditoria de graça, sem trabalho extra.

## Schema do banco (PostgreSQL)

```sql
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'staff');

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role       user_role NOT NULL DEFAULT 'staff',
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  scopes       TEXT[],
  created_by   UUID REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES users(id),
  region          TEXT,
  source_type     TEXT NOT NULL,        -- 'photo' | 'text' | 'link'
  source_text     TEXT,
  source_url      TEXT,
  scraped_content TEXT,                 -- texto extraído quando source_type = 'link'
  status          TEXT NOT NULL DEFAULT 'processing_ai',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,            -- foto original, sem edição
  order_index INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE art_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  canvas_width      INT NOT NULL DEFAULT 1080,
  canvas_height     INT NOT NULL DEFAULT 1080,   -- ou 1350 pro formato 4:5
  overlay_asset_url TEXT NOT NULL,       -- PNG da moldura/marca d'água, transparente onde a foto entra
  photo_slot        JSONB NOT NULL,      -- { x, y, width, height }
  text_slot         JSONB NOT NULL,      -- { x, y, width, height, font, fontSize, color, align }
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE style_reference (
  id                 INT PRIMARY KEY DEFAULT 1,   -- linha única
  example_title      TEXT,
  example_short_news TEXT,
  example_caption    TEXT,
  example_art_text   TEXT,
  updated_by         UUID REFERENCES users(id),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  origin            TEXT NOT NULL,      -- 'ai_generated' | 'manual_edit' | 'ai_regenerated'
  title             TEXT,
  short_news        TEXT,
  instagram_caption TEXT,
  art_text          TEXT,
  selected_photo_id UUID REFERENCES post_photos(id),
  photo_transform   JSONB,              -- { offsetX, offsetY, scale } do editor Fabric.js
  art_template_id   UUID REFERENCES art_templates(id),
  rendered_art_url  TEXT,               -- resultado do render final (Sharp)
  edited_by         UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review_decisions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_version_id  UUID NOT NULL REFERENCES post_versions(id),
  reviewer_id      UUID NOT NULL REFERENCES users(id),
  decision         TEXT NOT NULL,       -- 'approved' | 'rejected' | 'regenerate' | 'manual_edit'
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_version_id     UUID NOT NULL REFERENCES post_versions(id),
  instagram_media_id  TEXT,
  instagram_post_url  TEXT,
  status              TEXT NOT NULL,    -- 'pending' | 'container_created' | 'published' | 'failed'
  error_message       TEXT,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Endpoints da API

```
POST   /posts                          → { source_type, source_text?, source_url?, photos[] }
                                          (dispara IA: só texto — title, short_news, caption, art_text sugerido)

POST   /posts/:id/art                  → salva photo_transform + art_text ajustado no editor
                                          → dispara render final no servidor (Sharp) → rendered_art_url

POST   /posts/:id/regenerate           → novo ciclo de IA (nova versão, mesmas fotos)
PATCH  /posts/:id/versions/:vid        → edição manual de texto

POST   /posts/:id/versions/:vid/approve → dispara publicação no Instagram
POST   /posts/:id/versions/:vid/reject  → decision = rejected + motivo obrigatório

GET    /posts / /posts/:id             → listagem e detalhe (com versões e decisões)

GET/PUT  /style-reference              → o exemplo de texto padrão usado como referência na IA
GET/POST /art-templates                → cadastro do(s) template(s) fixo(s)

GET/POST/PATCH /users                  → admin gerencia usuários e papéis
GET/POST/DELETE /api-keys              → só admin
```

## Papéis (roles)

| Papel | Permissões |
|---|---|
| **admin** | Tudo — usuários, chaves de API, templates, style reference, aprovar/publicar |
| **manager** | Aprovar/recusar/refazer/editar/publicar; editar style reference e templates |
| **staff** (jornalista) | Envia fontes, edita as próprias submissões antes da aprovação; não aprova nem publica sozinho |

## Publicação no Instagram

- API: Instagram Graph API (Meta), fluxo em 2 passos:
  1. `POST /{ig-user-id}/media` com `image_url` (a arte final, hospedada publicamente) + `caption` → retorna `creation_id`.
  2. `POST /{ig-user-id}/media_publish` com `creation_id` → retorna o `id` do post publicado.
- Requisitos: conta Instagram Business/Creator vinculada a uma Página do Facebook, app criado em developers.facebook.com, conta adicionada como **Instagram Tester** dentro do app.
- **Importante:** como a publicação é só na conta da própria empresa (não em contas de terceiros), o app pode rodar em **modo de desenvolvimento** — não precisa passar pelo App Review do Meta, que só é obrigatório quando o app publica em contas de outras empresas/clientes.
- Permissão necessária: `instagram_business_content_publish` (nome atual; documentações antigas usam `instagram_content_publish`).
- Limite: até 100 posts publicados via API por período móvel de 24h por conta.

## Decisões já validadas (não reabrir sem motivo forte)

- Sem agendamento — publicação é sempre imediata, sob demanda.
- Sem geração de imagem por IA — a IA só gera texto.
- Sem seleção automática de "melhor foto" — o jornalista escolhe e ajusta manualmente.
- Sem Canva — o template é reproduzido em código (overlay PNG fixo) e composto via Fabric.js (edição) + Sharp (render final).
- Style guide simplificado — um único exemplo de referência, não uma biblioteca de exemplos.
- Três tipos de fonte: foto, texto pronto, link (que precisa de scraping antes de ir pra IA).
- Três papéis: admin, manager, staff, com separação entre quem cria e quem aprova.

## Primeiros passos sugeridos pro Claude Code

1. Inicializar o projeto Next.js + TypeScript + Prisma (ou Drizzle) + PostgreSQL.
2. Rodar as migrations com o schema acima.
3. Implementar autenticação simples com roles (NextAuth ou solução própria).
4. Endpoint `POST /posts` com o pipeline de IA (texto only).
5. Componente do editor de arte com Fabric.js (foto + overlay fixo + texto editável).
6. Endpoint de render final com Sharp.
7. Tela de revisão (mockup de post do Instagram + botões aprovar/recusar/refazer/editar).
8. Integração com Instagram Graph API (2-step publish).
9. Painel admin (usuários, papéis, API keys, templates, style reference).
