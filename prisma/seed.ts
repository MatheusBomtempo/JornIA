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

async function ensureDefaultOverlay(): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads", "templates");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "default-overlay.png");

  // Overlay 1080x1080 transparente com uma barra inferior para o texto.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect x="0" y="700" width="1080" height="380" fill="black" opacity="0.55"/>
    <rect x="0" y="690" width="1080" height="12" fill="#3366ff"/>
    <text x="60" y="1035" font-family="sans-serif" font-size="34" font-weight="700" fill="#9db6ff">SEU JORNAL</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);

  return `${PUBLIC_BASE_URL}/uploads/templates/default-overlay.png`;
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

  // Style reference (linha única).
  await prisma.styleReference.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      exampleTitle: "Chuva forte alaga avenida no centro nesta manhã",
      exampleShortNews:
        "Uma pancada de chuva alagou a avenida central na manhã desta segunda. A Defesa Civil orienta motoristas a evitar a região. Não há registro de feridos.",
      exampleCaption:
        "Alagamento no centro nesta manhã 🌧️ Evite a avenida central e acompanhe as atualizações no nosso perfil. #tempo #cidade",
      exampleArtText: "CHUVA ALAGA O CENTRO",
      updatedBy: admin.id,
    },
  });
  console.log("  style reference: ok");

  // Template padrão (só cria se não houver nenhum).
  const count = await prisma.artTemplate.count();
  if (count === 0) {
    const overlayUrl = await ensureDefaultOverlay();
    await prisma.artTemplate.create({
      data: {
        name: "Padrão 1:1 (feed)",
        canvasWidth: 1080,
        canvasHeight: 1080,
        overlayAssetUrl: overlayUrl,
        photoSlot: { x: 0, y: 0, width: 1080, height: 1080 },
        textSlot: {
          x: 60,
          y: 760,
          width: 960,
          height: 260,
          fontSize: 72,
          color: "#ffffff",
          align: "left",
          weight: 800,
        },
      },
    });
    console.log("  template padrão: criado");
  } else {
    console.log("  template padrão: já existe, pulando");
  }

  console.log("Seed concluído ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
