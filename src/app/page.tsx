import { redirect } from "next/navigation";

export default function Home() {
  // O middleware cuida de mandar pro /login quando não há sessão.
  redirect("/dashboard");
}
