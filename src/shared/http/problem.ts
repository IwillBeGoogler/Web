import { z } from "zod";

/** RFC 9457 problem details as the Go API writes them. */
export const problemSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    status: z.number().optional(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.string().optional(),
    numeric_code: z.number().optional(),
    request_id: z.string().optional(),
  })
  .loose();

export type Problem = z.infer<typeof problemSchema>;

export interface RequestInfo {
  method: string;
  path: string;
}

/** ApiError is a failed request carrying the server's problem details. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly numericCode: number | undefined;
  readonly requestId: string | undefined;
  readonly problem: Problem;
  /** The failed call (path without query string); never the body. */
  readonly request: RequestInfo | undefined;

  constructor(status: number, problem: Problem = {}, request?: RequestInfo) {
    super(problem.detail || problem.title || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code;
    this.numericCode = problem.numeric_code;
    this.requestId = problem.request_id;
    this.problem = problem;
    this.request = request;
  }

  get isConflict() {
    return this.status === 409;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

/** The request never got an answer (offline, DNS, CORS, connection reset). */
export class NetworkError extends Error {
  readonly request: RequestInfo;
  constructor(request: RequestInfo, cause?: unknown) {
    super(`Network error: ${request.method} ${request.path}`, { cause });
    this.name = "NetworkError";
    this.request = request;
  }
}

/** Response body did not match the expected contract. */
export class ContractError extends Error {
  readonly issues: z.core.$ZodIssue[];
  constructor(path: string, issues: z.core.$ZodIssue[]) {
    super(`Unexpected response from ${path}`);
    this.name = "ContractError";
    this.issues = issues;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Human message for any thrown value. */
export const errorMessage = (e: unknown): string => {
  if (e instanceof ApiError) return e.requestId ? `${e.message} (request ${e.requestId})` : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
};
