interface EnvVarRule {
  description: string;
  optional?: boolean;
  validator?: (value: string) => string | null;
}

function isHttpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol === "http:" || u.protocol === "https:") return null;
    return "must be an http(s) URL";
  } catch {
    return "must be a valid URL";
  }
}

function isSnowflake(value: string): string | null {
  return /^\d{15,20}$/.test(value) ? null : "must be a numeric Discord snowflake (15-20 digits)";
}

function isPort(value: string): string | null {
  const n = Number(value);
  return /^\d{1,5}$/.test(value) && Number.isInteger(n) && n >= 1 && n <= 65535
    ? null
    : "must be an integer port 1-65535";
}

function isPem(value: string): string | null {
  return value.includes("-----BEGIN") ? null : "must be a PEM certificate";
}

const minLength = (n: number) => (value: string): string | null =>
  value.length >= n ? null : `must be at least ${n} characters`;

export const envSchema: Record<string, EnvVarRule> = {
  POSTGRES_HOST: { description: "PostgreSQL host" },
  POSTGRES_USER: { description: "PostgreSQL user" },
  POSTGRES_DATABASE: { description: "PostgreSQL database" },
  POSTGRES_PASSWORD: { description: "PostgreSQL password" },
  POSTGRES_PORT: { description: "PostgreSQL port (default: 6543)", optional: true, validator: isPort },
  POSTGRES_CA: { description: "PostgreSQL CA cert for TLS", optional: true, validator: isPem },
  JWT_SECRET: { description: "JWT signing secret", validator: minLength(32) },
  UPLOADTHING_TOKEN: { description: "UploadThing API token", validator: minLength(20) },
  DISCORD_CLIENT_ID: { description: "Discord OAuth client ID", validator: isSnowflake },
  DISCORD_CLIENT_SECRET: { description: "Discord OAuth client secret", validator: minLength(20) },
  DISCORD_REDIRECT_URI: { description: "Discord OAuth redirect URI", validator: isHttpUrl },
  DISCORD_GUILD_EXCELSIOR_ID: { description: "Discord Excelsior guild ID", optional: true, validator: isSnowflake },
  DISCORD_GUILD_COSMOTEER_ID: { description: "Discord Cosmoteer guild ID", optional: true, validator: isSnowflake },
  CLIENT_URL: { description: "Client URL (e.g., https://yourdomain.com)", validator: isHttpUrl },
  TURNSTILE_SECRET: { description: "Turnstile secret key", validator: minLength(20) },
  NEXT_PUBLIC_TURNSTILE_SITEKEY: { description: "Turnstile site key", validator: minLength(10) },
  ADMIN_USERNAMES: { description: "Comma-separated admin usernames", optional: true },
  ALLOWED_ORIGINS: { description: "Comma-separated allowed CORS origins", optional: true },
};

export const requiredEnvVars = Object.fromEntries(
  Object.entries(envSchema)
    .filter(([, rule]) => !rule.optional)
    .map(([key, rule]) => [key, rule.description]),
) as Record<string, string>;

export const optionalEnvVars = Object.fromEntries(
  Object.entries(envSchema)
    .filter(([, rule]) => rule.optional)
    .map(([key, rule]) => [key, rule.description]),
) as Record<string, string>;

function validateEnv(): void {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, rule] of Object.entries(envSchema)) {
    const value = process.env[key] ?? "";
    if (!rule.optional && value.trim() === "") {
      missing.push(`${key} (${rule.description})`);
      continue;
    }
    if (value.trim() === "") continue; // optional and unset
    if (rule.validator) {
      const err = rule.validator(value.trim());
      if (err) invalid.push(`${key}: ${err}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((m) => `  - ${m}`).join("\n")}`
    );
  }

  if (invalid.length > 0) {
    throw new Error(`Invalid environment variables:\n${invalid.map((i) => `  - ${i}`).join("\n")}`);
  }

  for (const key of Object.keys(optionalEnvVars)) {
    if (!process.env[key]) {
      console.warn(`[env] Optional variable not set: ${key} (${envSchema[key].description})`);
    }
  }

  console.log("[env] All required environment variables validated successfully");
}

export function getRequiredEnv(key: keyof typeof envSchema): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${String(key)} is not set`);
  return value;
}

if (typeof window === "undefined") {
  validateEnv();
}
