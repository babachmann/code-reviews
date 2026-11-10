import { createSchema } from "graphql-yoga";
import { GraphQLError } from "graphql";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export const typeDefs = /* GraphQL */ `
  type Greeting {
    id: Int!
    message: String!
    createdAt: String!
  }

  "A country as classified by the World Bank."
  type Country {
    "ISO 3166-1 alpha-3 code, e.g. GBR"
    code: String!
    "ISO 3166-1 alpha-2 code, e.g. GB"
    iso2Code: String!
    name: String!
    region: String!
    regionCode: String!
    incomeLevel: String!
    incomeLevelCode: String!
    capitalCity: String
    latitude: Float
    longitude: Float
    "Observations for this country, optionally filtered by indicator and year range."
    observations(indicatorCode: String, fromYear: Int, toYear: Int): [Observation!]!
  }

  "A World Bank data series, e.g. GDP per capita."
  type Indicator {
    code: String!
    name: String!
    sourceNote: String
    sourceOrganization: String
    lastFetchedAt: String
    "Number of stored observations for this indicator."
    observationCount: Int!
    "Earliest and latest year with data."
    yearRange: YearRange
    "Most recent year with data for at least 100 countries. Use this as a sensible default year."
    latestYear: Int
  }

  type YearRange {
    min: Int!
    max: Int!
  }

  "One indicator value for one country in one year."
  type Observation {
    id: Int!
    countryCode: String!
    indicatorCode: String!
    year: Int!
    value: Float!
    country: Country!
    indicator: Indicator!
  }

  "Row counts and freshness of the ingested dataset."
  type DataSummary {
    countries: Int!
    indicators: Int!
    observations: Int!
    regions: [String!]!
    incomeLevels: [String!]!
    lastIngestedAt: String
  }

  "Headline figures for the dashboard."
  type DashboardSummary {
    "Sum of the latest population figures across all countries."
    worldPopulation: Float!
    worldPopulationYear: Int!
    "Simple (unweighted) mean of life expectancy across countries."
    avgLifeExpectancy: Float!
    avgLifeExpectancyYear: Int!
    countries: Int!
    "Latest year present anywhere in the dataset."
    latestYear: Int!
  }

  "Unweighted mean of an indicator across the countries in a region."
  type RegionAverage {
    region: String!
    regionCode: String!
    average: Float!
    "Number of countries in the region that had a value for the year."
    countryCount: Int!
  }

  type SnapshotValue {
    indicatorCode: String!
    value: Float!
  }

  "Several indicator values for one country in one year."
  type CountrySnapshot {
    country: Country!
    "Only indicators that have a value for the year are present."
    values: [SnapshotValue!]!
  }

  enum SortOrder {
    ASC
    DESC
  }

  "A named dashboard configuration. Saved views are shared by everyone using the app."
  type SavedView {
    "Unique id of the saved view."
    id: Int!
    "Name chosen by the user. Unique, trimmed, at most 60 characters."
    name: String!
    "Indicator code shown on the dashboard, e.g. NY.GDP.PCAP.CD"
    indicator: String!
    "Year shown on the dashboard. Null means the indicator's latest year."
    year: Int
    "ISO3 codes of the countries on the line chart, e.g. GBR."
    countries: [String!]!
    "Order of the ranking chart."
    order: SortOrder!
    "World Bank region highlighted on the scatter chart, or null for none."
    region: String
    "When the view was saved (ISO 8601)."
    createdAt: String!
  }

  "The dashboard settings to save under a name."
  input SavedViewInput {
    "Name for the view. Trimmed, must not be empty, at most 60 characters and unique."
    name: String!
    "Indicator code, e.g. NY.GDP.PCAP.CD"
    indicator: String!
    "Year to show. Null means the indicator's latest year."
    year: Int
    "ISO3 codes of the countries on the line chart."
    countries: [String!]!
    "Order of the ranking chart."
    order: SortOrder!
    "World Bank region to highlight, or null for none."
    region: String
  }

  type Query {
    "Simple health-check style query that does not touch the database."
    hello: String!

    "All greetings stored in the SQLite database, newest first."
    greetings: [Greeting!]!

    "Counts and freshness of the World Bank data."
    dataSummary: DataSummary!

    "Countries, optionally filtered by region and/or income level."
    countries(region: String, incomeLevel: String): [Country!]!

    "A single country by ISO3 code."
    country(code: String!): Country

    "All ingested indicators."
    indicators: [Indicator!]!

    "A single indicator by code."
    indicator(code: String!): Indicator

    """
    Observations for an indicator. Filter by country codes and/or year range.
    Results are ordered by year then country code.
    """
    observations(
      indicatorCode: String!
      countryCodes: [String!]
      fromYear: Int
      toYear: Int
    ): [Observation!]!

    """
    Top (or bottom) countries for an indicator in a given year.
    """
    ranking(indicatorCode: String!, year: Int!, limit: Int = 10, order: SortOrder = DESC): [Observation!]!

    "Headline figures for the dashboard."
    dashboardSummary: DashboardSummary!

    "Unweighted mean of an indicator per World Bank region for a year, sorted by average descending."
    regionAverages(indicatorCode: String!, year: Int!): [RegionAverage!]!

    """
    For every country, the values of the requested indicators in a year.
    Countries with no value for any of the indicators are omitted.
    """
    countrySnapshot(indicatorCodes: [String!]!, year: Int!): [CountrySnapshot!]!

    "Saved views, newest first. Pass a limit to get only the most recent ones."
    savedViews(limit: Int): [SavedView!]!

    "A single saved view by id, or null if it does not exist."
    savedView(id: Int!): SavedView
  }

  type Mutation {
    "Store a new greeting in the database and return it."
    addGreeting(message: String!): Greeting!

    "Save the given dashboard settings under a name and return the new view."
    createSavedView(input: SavedViewInput!): SavedView!

    "Delete a saved view. Returns false if no view had that id."
    deleteSavedView(id: Int!): Boolean!
  }
`;

type YearArgs = { fromYear?: number | null; toYear?: number | null };

function yearFilter({ fromYear, toYear }: YearArgs): Prisma.IntFilter | undefined {
  if (fromYear == null && toYear == null) return undefined;
  return {
    ...(fromYear != null ? { gte: fromYear } : {}),
    ...(toYear != null ? { lte: toYear } : {}),
  };
}

/** Latest year in which an indicator has values for at least `minCountries` countries. */
async function latestYearWithCoverage(indicatorCode: string, minCountries = 100): Promise<number | null> {
  const rows = await prisma.observation.groupBy({
    by: ["year"],
    where: { indicatorCode },
    _count: { _all: true },
    orderBy: { year: "desc" },
  });
  return rows.find((r) => r._count._all >= minCountries)?.year ?? null;
}

const SAVED_VIEW_NAME_MAX = 60;

type SavedViewInput = {
  name: string;
  indicator: string;
  year?: number | null;
  countries: string[];
  order: "ASC" | "DESC";
  region?: string | null;
};

const POPULATION = "SP.POP.TOTL";
const LIFE_EXPECTANCY = "SP.DYN.LE00.IN";

export const resolvers = {
  Query: {
    hello: () => "Hello, World!",

    greetings: async () => prisma.greeting.findMany({ orderBy: { createdAt: "desc" } }),

    dataSummary: async () => {
      const [countries, indicators, observations, regionRows, incomeRows, latest] = await Promise.all([
        prisma.country.count(),
        prisma.indicator.count(),
        prisma.observation.count(),
        prisma.country.findMany({ distinct: ["region"], select: { region: true }, orderBy: { region: "asc" } }),
        prisma.country.findMany({
          distinct: ["incomeLevel"],
          select: { incomeLevel: true },
          orderBy: { incomeLevel: "asc" },
        }),
        prisma.indicator.findFirst({
          where: { lastFetchedAt: { not: null } },
          orderBy: { lastFetchedAt: "desc" },
          select: { lastFetchedAt: true },
        }),
      ]);
      return {
        countries,
        indicators,
        observations,
        regions: regionRows.map((r) => r.region),
        incomeLevels: incomeRows.map((r) => r.incomeLevel),
        lastIngestedAt: latest?.lastFetchedAt?.toISOString() ?? null,
      };
    },

    countries: async (_p: unknown, args: { region?: string | null; incomeLevel?: string | null }) =>
      prisma.country.findMany({
        where: {
          ...(args.region ? { region: args.region } : {}),
          ...(args.incomeLevel ? { incomeLevel: args.incomeLevel } : {}),
        },
        orderBy: { name: "asc" },
      }),

    country: async (_p: unknown, args: { code: string }) =>
      prisma.country.findUnique({ where: { code: args.code.toUpperCase() } }),

    indicators: async () => prisma.indicator.findMany({ orderBy: { name: "asc" } }),

    indicator: async (_p: unknown, args: { code: string }) =>
      prisma.indicator.findUnique({ where: { code: args.code } }),

    observations: async (
      _p: unknown,
      args: { indicatorCode: string; countryCodes?: string[] | null } & YearArgs,
    ) =>
      prisma.observation.findMany({
        where: {
          indicatorCode: args.indicatorCode,
          ...(args.countryCodes?.length ? { countryCode: { in: args.countryCodes.map((c) => c.toUpperCase()) } } : {}),
          ...(yearFilter(args) ? { year: yearFilter(args) } : {}),
        },
        orderBy: [{ year: "asc" }, { countryCode: "asc" }],
      }),

    ranking: async (
      _p: unknown,
      args: { indicatorCode: string; year: number; limit?: number | null; order?: "ASC" | "DESC" | null },
    ) => {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 250);
      return prisma.observation.findMany({
        where: { indicatorCode: args.indicatorCode, year: args.year },
        orderBy: { value: args.order === "ASC" ? "asc" : "desc" },
        take: limit,
      });
    },

    dashboardSummary: async () => {
      const [popYear, leYear, countries, latest] = await Promise.all([
        latestYearWithCoverage(POPULATION),
        latestYearWithCoverage(LIFE_EXPECTANCY),
        prisma.country.count(),
        prisma.observation.aggregate({ _max: { year: true } }),
      ]);
      const [pop, le] = await Promise.all([
        popYear == null
          ? null
          : prisma.observation.aggregate({ where: { indicatorCode: POPULATION, year: popYear }, _sum: { value: true } }),
        leYear == null
          ? null
          : prisma.observation.aggregate({ where: { indicatorCode: LIFE_EXPECTANCY, year: leYear }, _avg: { value: true } }),
      ]);
      return {
        worldPopulation: pop?._sum.value ?? 0,
        worldPopulationYear: popYear ?? 0,
        avgLifeExpectancy: le?._avg.value ?? 0,
        avgLifeExpectancyYear: leYear ?? 0,
        countries,
        latestYear: latest._max.year ?? 0,
      };
    },

    regionAverages: async (_p: unknown, args: { indicatorCode: string; year: number }) => {
      const rows = await prisma.observation.findMany({
        where: { indicatorCode: args.indicatorCode, year: args.year },
        select: { value: true, country: { select: { region: true, regionCode: true } } },
      });
      const buckets = new Map<string, { region: string; regionCode: string; sum: number; count: number }>();
      for (const row of rows) {
        const b = buckets.get(row.country.regionCode) ?? {
          region: row.country.region,
          regionCode: row.country.regionCode,
          sum: 0,
          count: 0,
        };
        b.sum += row.value;
        b.count += 1;
        buckets.set(row.country.regionCode, b);
      }
      return [...buckets.values()]
        .map((b) => ({ region: b.region, regionCode: b.regionCode, average: b.sum / b.count, countryCount: b.count }))
        .sort((a, b) => b.average - a.average);
    },

    countrySnapshot: async (_p: unknown, args: { indicatorCodes: string[]; year: number }) => {
      const rows = await prisma.observation.findMany({
        where: { indicatorCode: { in: args.indicatorCodes }, year: args.year },
        include: { country: true },
        orderBy: { countryCode: "asc" },
      });
      const byCountry = new Map<string, { country: (typeof rows)[number]["country"]; values: { indicatorCode: string; value: number }[] }>();
      for (const row of rows) {
        const entry = byCountry.get(row.countryCode) ?? { country: row.country, values: [] };
        entry.values.push({ indicatorCode: row.indicatorCode, value: row.value });
        byCountry.set(row.countryCode, entry);
      }
      return [...byCountry.values()];
    },

    savedViews: async (_p: unknown, args: { limit?: number | null }) =>
      prisma.savedView.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(args.limit != null ? { take: Math.max(args.limit, 0) } : {}),
      }),

    savedView: async (_p: unknown, args: { id: number }) => prisma.savedView.findUnique({ where: { id: args.id } }),
  },

  Mutation: {
    addGreeting: async (_parent: unknown, args: { message: string }) => {
      const message = args.message.trim();
      if (!message) {
        throw new Error("Greeting message cannot be empty.");
      }
      return prisma.greeting.create({ data: { message } });
    },

    createSavedView: async (_parent: unknown, args: { input: SavedViewInput }) => {
      const { input } = args;
      const name = input.name.trim();
      if (!name) {
        throw new GraphQLError("Please enter a name for the view.");
      }
      if (name.length > SAVED_VIEW_NAME_MAX) {
        throw new GraphQLError(`View names can be at most ${SAVED_VIEW_NAME_MAX} characters.`);
      }
      if (await prisma.savedView.findUnique({ where: { name } })) {
        throw new GraphQLError(`A view called "${name}" already exists. Please choose another name.`);
      }
      try {
        return await prisma.savedView.create({
          data: {
            name,
            indicator: input.indicator,
            year: input.year ?? null,
            countries: input.countries.join(","),
            order: input.order,
            region: input.region || null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new GraphQLError(`A view called "${name}" already exists. Please choose another name.`);
        }
        throw err;
      }
    },

    deleteSavedView: async (_parent: unknown, args: { id: number }) => {
      const { count } = await prisma.savedView.deleteMany({ where: { id: args.id } });
      return count > 0;
    },
  },

  Greeting: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },

  SavedView: {
    countries: (parent: { countries: string }) => parent.countries.split(",").filter(Boolean),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },

  Country: {
    observations: async (parent: { code: string }, args: { indicatorCode?: string | null } & YearArgs) =>
      prisma.observation.findMany({
        where: {
          countryCode: parent.code,
          ...(args.indicatorCode ? { indicatorCode: args.indicatorCode } : {}),
          ...(yearFilter(args) ? { year: yearFilter(args) } : {}),
        },
        orderBy: [{ indicatorCode: "asc" }, { year: "asc" }],
      }),
  },

  Indicator: {
    lastFetchedAt: (parent: { lastFetchedAt: Date | null }) => parent.lastFetchedAt?.toISOString() ?? null,
    observationCount: (parent: { code: string }) =>
      prisma.observation.count({ where: { indicatorCode: parent.code } }),
    latestYear: (parent: { code: string }) => latestYearWithCoverage(parent.code),
    yearRange: async (parent: { code: string }) => {
      const agg = await prisma.observation.aggregate({
        where: { indicatorCode: parent.code },
        _min: { year: true },
        _max: { year: true },
      });
      if (agg._min.year == null || agg._max.year == null) return null;
      return { min: agg._min.year, max: agg._max.year };
    },
  },

  Observation: {
    country: (parent: { countryCode: string }) =>
      prisma.country.findUniqueOrThrow({ where: { code: parent.countryCode } }),
    indicator: (parent: { indicatorCode: string }) =>
      prisma.indicator.findUniqueOrThrow({ where: { code: parent.indicatorCode } }),
  },
};

export const schema = createSchema({ typeDefs, resolvers });
