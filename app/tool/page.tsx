import { redirect } from "next/navigation";

// /tool is deprecated — every user has a dedicated agent at /for/[vertical]
// This redirect preserves any old bookmarks
export default function ToolRedirect() {
  redirect("/");
}
