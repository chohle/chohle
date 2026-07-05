// $fetch on a dynamic external URL (a widened `string`, not a literal) makes
// Nuxt's generated route types recurse until TS2321 "excessive stack depth",
// and the error surfaces nondeterministically depending on compilation order.
// This wrapper resolves the global $fetch at call time (so test stubs still
// apply) through a plainly-typed signature, sidestepping the route matcher.
export function externalFetch<T>(
  url: string,
  opts?: { headers?: Record<string, string> }
): Promise<T> {
  const f = $fetch as unknown as (
    url: string,
    opts?: { headers?: Record<string, string> }
  ) => Promise<T>
  return f(url, opts)
}
