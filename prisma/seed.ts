import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

async function ensureUser(
  name: string,
  email: string,
  password: string,
  role: "admin" | "manager" | "staff",
) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { name, email, role, passwordHash },
  });
  console.log(`  usuário ${role}: ${email} / ${password}`);
  return user;
}

/**
 * Overlay padrão: painel escuro na parte de baixo (com degradê) para o
 * título e o subtítulo ficarem legíveis sobre qualquer foto.
 * Substitua pelo PNG do seu Canva em Admin → Templates.
 */
async function ensureOverlay(w: number, h: number, file: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "templates");
  await fs.mkdir(dir, { recursive: true });

  const panelTop = Math.round(h * 0.58);
  const fadeTop = Math.round(h * 0.44);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05070b" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05070b" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${fadeTop}" width="${w}" height="${panelTop - fadeTop}" fill="url(#fade)"/>
    <rect x="0" y="${panelTop}" width="${w}" height="${h - panelTop}" fill="#05070b" opacity="0.92"/>
    <rect x="64" y="${panelTop - 34}" width="96" height="7" rx="3.5" fill="#4d7cff"/>
    <text x="64" y="${h - 44}" font-family="sans-serif" font-size="26"
          font-weight="700" fill="#7f9cff" letter-spacing="3">SEU JORNAL</text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, file));
  return `${PUBLIC_BASE_URL}/uploads/templates/${file}`;
}

/** Slots proporcionais ao formato, com os tamanhos medidos no Canva. */
function slotsFor(w: number, h: number) {
  const titleY = Math.round(h * 0.648);
  return {
    photoSlot: { x: 0, y: 0, width: w, height: h },
    titleSlot: {
      x: 64, y: titleY, width: w - 128, height: Math.round(h * 0.105),
      fontSize: 38.2, weight: 600, color: "#ffffff",
      align: "left", lineHeight: 1.25, transform: "none",
    },
    subtitleSlot: {
      x: 64, y: titleY + Math.round(h * 0.115), width: w - 128,
      height: Math.round(h * 0.1),
      fontSize: 24, weight: 400, color: "#d8dEE9",
      align: "left", lineHeight: 1.3, transform: "none",
    },
  };
}

async function main() {
  console.log("Seed do JornIA…");

  const admin = await ensureUser(
    "Admin",
    process.env.SEED_ADMIN_EMAIL ?? "admin@jornia.local",
    process.env.SEED_ADMIN_PASSWORD ?? "admin12345",
    "admin",
  );
  await ensureUser("Editor Exemplo", "editor@jornia.local", "editor12345", "manager");
  await ensureUser("Jornalista Exemplo", "reporter@jornia.local", "reporter123", "staff");

  // ── Exemplos de estilo (posts reais do jornal) ─────────────
  if ((await prisma.styleExample.count()) === 0) {
    await prisma.styleExample.createMany({
      data: [
        {
          orderIndex: 0,
          createdBy: admin.id,
          title: "Tragédia em BH: acidente entre motos deixa dois mortos",
          subtitle:
            "Colisão entre as duas motocicletas ocorreu na Avenida José Cândido da Silveira, no bairro União.",
          caption: `Duas pessoas morreram em um acidente envolvendo duas motocicletas na noite deste sábado (13), na Avenida José Cândido da Silveira, no bairro União, em Belo Horizonte.

As duas vítimas não resistiram aos ferimentos e morreram no local. Equipes de emergência e a perícia estiveram na cena para atendimento e levantamento do acidente.

📸 @arrobadofotografo

#BH #Acidente`,
        },
        {
          orderIndex: 1,
          createdBy: admin.id,
          title:
            "Especialistas alertam para avanço da miopia entre crianças e adolescentes",
          subtitle:
            "Cartilha orienta famílias sobre o uso de telas e recomenda pelo menos duas horas de atividades ao ar livre por dia.",
          caption: `A Sociedade Brasileira de Oftalmologia Pediátrica e o Conselho Brasileiro de Oftalmologia lançaram uma cartilha com orientações para ajudar a prevenir e controlar o avanço da miopia entre crianças e adolescentes.

O material chama atenção para o excesso de tempo em ambientes fechados, o uso prolongado de telas e a pouca exposição à luz natural. A recomendação central é que crianças e adolescentes passem pelo menos duas horas por dia ao ar livre, com atividades como brincadeiras, caminhadas, esportes e contato com a natureza.

Segundo o Conselho Brasileiro de Oftalmologia, a exposição à luz natural pode atuar como fator de proteção contra a progressão da miopia. A cartilha também orienta que o tempo de tela seja limitado conforme a idade:

👶 Menores de 2 anos: nenhum tempo de tela
🧒 De 2 a 5 anos: até 1 hora por dia
👧 De 5 a 10 anos: até 2 horas por dia
👦 De 10 a 18 anos: até 3 horas por dia

Os especialistas também recomendam pausas durante atividades que exigem visão de perto, distância adequada dos dispositivos e proteção solar.

A cartilha foi lançada durante o 70º Congresso Brasileiro de Oftalmologia, em Salvador, e será distribuída para secretarias de Saúde e Educação de todo o país.

#MiopiaInfantil #SaúdeOcular #Crianças #Saúde #Barbacena #MG`,
        },
      ],
    });
    console.log("  exemplos de estilo: 2 criados");
  } else {
    console.log("  exemplos de estilo: já existem, pulando");
  }

  // ── Templates (1:1 e 4:5) — idempotente por nome ───────────
  for (const f of [
    { name: "Padrão 1:1 (feed)", w: 1080, h: 1080, file: "overlay-1x1.png" },
    { name: "Padrão 4:5 (retrato)", w: 1080, h: 1350, file: "overlay-4x5.png" },
  ]) {
    const overlayUrl = await ensureOverlay(f.w, f.h, f.file);
    const data = {
      name: f.name,
      canvasWidth: f.w,
      canvasHeight: f.h,
      overlayAssetUrl: overlayUrl,
      isActive: true,
      ...slotsFor(f.w, f.h),
    };

    const existing = await prisma.artTemplate.findFirst({ where: { name: f.name } });
    if (existing) {
      await prisma.artTemplate.update({ where: { id: existing.id }, data });
      console.log(`  template atualizado: ${f.name}`);
    } else {
      await prisma.artTemplate.create({ data });
      console.log(`  template criado: ${f.name}`);
    }
  }

  console.log("Seed concluído ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
