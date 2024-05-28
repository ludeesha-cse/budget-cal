// Server Components can't fetch() a relative URL the way browser code can — there's
// no implicit "current origin" on the server, so every fetch from a Server Component
// needs a fully-qualified URL. This resolves one: an explicit NEXT_PUBLIC_APP_URL
// when set (e.g. a deployed environment), falling back to localhost for local dev,
// where these Route Handlers are served by this same Next.js app.
export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
