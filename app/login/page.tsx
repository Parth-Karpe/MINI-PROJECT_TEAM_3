import { redirect } from "next/navigation";
import DemoLogin from "./DemoLogin";
import { hostedDemoLoginEnabled } from "@/lib/demoLogin";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!hostedDemoLoginEnabled() && (process.env.CAMPUS_AUTH_CONFIG_JSON || process.env.VERCEL)) redirect("/login/admin");
  return <DemoLogin />;
}
