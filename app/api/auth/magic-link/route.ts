import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_EMAIL } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const emailRedirectTo = new URL("/auth/callback", siteUrl).toString();
    const { error } = await supabase.auth.signInWithOtp({
      email: ALLOWED_EMAIL,
      options: { emailRedirectTo, shouldCreateUser: false },
    });

    if (error) {
      return NextResponse.json({ error: "The sign-in link could not be sent." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }
}
