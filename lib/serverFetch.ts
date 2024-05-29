import { cookies } from 'next/headers'

// Server Components calling this app's own Route Handlers via fetch() are making a
// brand-new outgoing HTTP request from the Node.js server — the browser's session
// cookie from the *incoming* page request isn't automatically attached to it (unlike
// a normal browser-to-server fetch). Without forwarding it explicitly, every internal
// fetch() call looks unauthenticated to the Route Handler on the other end, even
// though the page itself was rendered inside an authenticated session.
export function serverFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookies().toString(),
    },
  })
}
