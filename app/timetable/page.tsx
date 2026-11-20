import { redirect } from "next/navigation";

export default function ImportRedirect() {
  redirect("/dashboards/admin#imports");
}
