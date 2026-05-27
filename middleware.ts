import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/bootstrap", "/no-access"];
const INVITE_PREFIX = "/invite/";
const CALLBACK_PREFIX = "/auth/";

// Refreshes the Supabase session cookie on every navigation, then enforces a
// coarse signed-in-vs-not gate. Role-based access checks live in the pages
// themselves via requireRole(); this middleware only prevents a logged-out user
// from poking at app routes (and bounces signed-in users away from /login).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.includes(path) ||
    path.startsWith(INVITE_PREFIX) ||
    path.startsWith(CALLBACK_PREFIX);

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (data.user && (path === "/login" || path === "/bootstrap")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Exclude /api from the middleware. API routes handle their own auth
  // (bearer token for ingestion, session+RLS for user-initiated actions).
  // Running the session-check middleware on them incorrectly redirects
  // unauthenticated machine-to-machine requests to /login.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
