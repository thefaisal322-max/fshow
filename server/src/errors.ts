/**
 * Every error the app understands has a `reason` string.
 * The app maps reasons to Pashto messages (src/lib/api.ts → errorMessage).
 * Response body: { "error": reason, ...extra }
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(reason);
  }
}

export function fail(status: number, reason: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError(status, reason, extra);
}
