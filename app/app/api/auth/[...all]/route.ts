import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth";

// Better Auth's endpoints (auth.ts): the links in its emails (confirming an email)
// and reading or ending the session. The site's forms call it from server actions.
export const { GET, POST } = toNextJsHandler(auth);
