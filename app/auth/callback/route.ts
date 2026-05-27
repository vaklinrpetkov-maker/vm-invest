import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Supabase email links (recovery, magic link) redirect here with a `code`
// param. We exchange it for a session cookie and forward the user on.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=callback`, url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
