import "server-only";

import { z } from "zod";

import type { AuthorizationContext } from "@/lib/authorization";
import { can, getAuthorization } from "@/lib/authorization";

export const AI_COO_TIME_ZONE = "Indian/Maldives" as const;

export type AiCooToolErrorCode =
  | "UNAUTHENTICATED"
  | "AI_COO_FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type AiCooToolResult<T> =
  | {
      ok: true;
      data: T;
      meta: {
        generatedAt: string;
        timeZone: typeof AI_COO_TIME_ZONE;
        registerScope: "ALL";
      };
    }
  | {
      ok: false;
      error: {
        code: AiCooToolErrorCode;
        message: string;
        retryable: boolean;
      };
    };

export class AiCooToolError extends Error {
  constructor(
    public readonly code: Exclude<AiCooToolErrorCode, "UNAUTHENTICATED" | "AI_COO_FORBIDDEN" | "INVALID_INPUT" | "INTERNAL_ERROR">,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

type ToolConfiguration<InputSchema extends z.ZodType, OutputSchema extends z.ZodType> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (
    input: z.output<InputSchema>,
    context: { authorization: AuthorizationContext },
  ) => Promise<unknown>;
};

export type AiCooTool<InputSchema extends z.ZodType = z.ZodType, OutputSchema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: unknown) => Promise<AiCooToolResult<z.output<OutputSchema>>>;
};

type AuthorizationResolver = () => Promise<AuthorizationContext | null>;

const toolConfigurations = new WeakMap<object, ToolConfiguration<z.ZodType, z.ZodType>>();

function failure(code: AiCooToolErrorCode, message: string, retryable = false): AiCooToolResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

export function normalizeJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    const decimal = value as { toNumber?: () => number; constructor?: { name?: string } };
    if (decimal.constructor?.name === "Decimal" && typeof decimal.toNumber === "function") {
      return decimal.toNumber();
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return String(value);
}

export async function runAiCooTool<InputSchema extends z.ZodType, OutputSchema extends z.ZodType>(
  configuration: ToolConfiguration<InputSchema, OutputSchema>,
  rawInput: unknown,
  resolveAuthorization: AuthorizationResolver = getAuthorization,
): Promise<AiCooToolResult<z.output<OutputSchema>>> {
  const parsedInput = configuration.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return failure("INVALID_INPUT", z.prettifyError(parsedInput.error));
  }

  const authorization = await resolveAuthorization();
  if (!authorization) return failure("UNAUTHENTICATED", "Sign in before using AI COO.");
  if (!can(authorization, "AI_COO_ACCESS")) {
    return failure("AI_COO_FORBIDDEN", "Your role does not have AI COO access.");
  }

  try {
    const rawOutput = await configuration.execute(parsedInput.data, { authorization });
    const parsedOutput = configuration.outputSchema.safeParse(normalizeJson(rawOutput));
    if (!parsedOutput.success) {
      console.error("AI COO tool returned an invalid response", configuration.name, parsedOutput.error);
      return failure("INTERNAL_ERROR", "The tool returned an invalid response.", true);
    }
    return {
      ok: true,
      data: parsedOutput.data,
      meta: {
        generatedAt: new Date().toISOString(),
        timeZone: AI_COO_TIME_ZONE,
        registerScope: "ALL",
      },
    };
  } catch (error) {
    if (error instanceof AiCooToolError) return failure(error.code, error.message, error.retryable);
    console.error("AI COO tool failed", configuration.name, error);
    return failure("INTERNAL_ERROR", "The tool could not complete the request.", true);
  }
}

export function defineAiCooTool<InputSchema extends z.ZodType, OutputSchema extends z.ZodType>(
  configuration: ToolConfiguration<InputSchema, OutputSchema>,
): AiCooTool<InputSchema, OutputSchema> {
  const tool: AiCooTool<InputSchema, OutputSchema> = {
    name: configuration.name,
    description: configuration.description,
    inputSchema: configuration.inputSchema,
    outputSchema: configuration.outputSchema,
    execute: (input) => runAiCooTool(configuration, input),
  };
  toolConfigurations.set(tool, configuration as ToolConfiguration<z.ZodType, z.ZodType>);
  return tool;
}

/**
 * Executes a registered tool with an already-resolved authorization context.
 * This keeps integration tests and a future trusted orchestrator independent
 * from request-header mocking while preserving the same validation and access checks.
 */
export async function runAiCooToolWithAuthorization<
  InputSchema extends z.ZodType,
  OutputSchema extends z.ZodType,
>(
  tool: AiCooTool<InputSchema, OutputSchema>,
  input: unknown,
  authorization: AuthorizationContext | null,
): Promise<AiCooToolResult<z.output<OutputSchema>>> {
  const configuration = toolConfigurations.get(tool);
  if (!configuration) return failure("INTERNAL_ERROR", "The tool is not registered.");
  return runAiCooTool(
    configuration as ToolConfiguration<InputSchema, OutputSchema>,
    input,
    async () => authorization,
  );
}
