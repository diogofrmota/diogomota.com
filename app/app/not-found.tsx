import type { Metadata } from "next";
import { MessagePage } from "@/components/site/MessagePage";

export const metadata: Metadata = { title: "page not found" };

export default function NotFound() {
  return (
    <MessagePage
      title="404"
      message="page not found"
      link={{ href: "/", label: "Go Home" }}
    />
  );
}
