import {
  CacheCase,
  PrismaExtensionRedis,
  type AutoCacheConfig,
  type CacheConfig,
} from "prisma-extension-redis";
import { SuperJSON } from "superjson";
import {redis} from "../lib/redis"
import { Redis } from "iovalkey";
import pino from 'pino';

const config: CacheConfig = {
  ttl: 60, // Default Time-to-live for caching in seconds
  stale: 30, // Default Stale time after ttl in seconds
  auto: {
    // excludedModels: ["User", "Friendship"],
    // excludedOperations: ["findMany", "findUnique", "findFirst", "count"],
  },
  logger: pino(),
  type: "JSON",
  cacheKey: {
    case: CacheCase.SNAKE_CASE,
    delimiter: "*",
    prefix: "prisma",
  },
  transformer: {
    deserialize: (data) => SuperJSON.parse(data),
    serialize: (data) => SuperJSON.stringify(data),
  },
};

export const cachedPrisma = PrismaExtensionRedis({ config, client: {
  host: "localhost",
  port: 6379,
} });