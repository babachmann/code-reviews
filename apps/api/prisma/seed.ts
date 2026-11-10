import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Load apps/api/.env when running locally; ignored when absent (Docker sets the variables directly).
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // rely on the process environment
}

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.greeting.count();
  if (count > 0) {
    console.log(`Database already seeded (${count} greetings). Skipping.`);
  } else {
    await prisma.greeting.createMany({
      data: [
        { message: "Hello, World!" },
        { message: "Hello from SQLite via Prisma" },
        { message: "Hello from the GraphQL API" },
      ],
    });

    console.log("Seeded 3 greetings.");
  }

  // Checked separately so databases seeded before saved views existed get them too.
  const viewCount = await prisma.savedView.count();
  if (viewCount > 0) {
    console.log(`Saved views already seeded (${viewCount}). Skipping.`);
    return;
  }

  await prisma.savedView.createMany({
    data: [
      { name: "G7 GDP per capita", indicator: "NY.GDP.PCAP.CD", year: null, countries: "CAN,FRA,DEU,ITA,JPN,GBR,USA", order: "DESC", region: null },
      { name: "Life expectancy in Africa", indicator: "SP.DYN.LE00.IN", year: null, countries: "NGA,ZAF,KEN,EGY,ETH", order: "ASC", region: "Sub-Saharan Africa" },
      { name: "Internet use 2015", indicator: "IT.NET.USER.ZS", year: 2015, countries: "GBR,USA,IND,CHN,BRA", order: "DESC", region: "South Asia" },
    ],
  });

  console.log("Seeded 3 saved views.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
