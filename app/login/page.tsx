import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginCard } from "@/components/login-card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAllowedEmail(user.email)) redirect("/");
  return <LoginCard />;
}
