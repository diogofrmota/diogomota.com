import { z } from "zod";

// zod, for every schema of the site: import it from here, not from "zod".
// zod 4 compiles object schemas with `new Function` when it can, and finds out
// whether it can by trying it, which the site's Content-Security-Policy
// (next.config.ts) blocks and reports as a violation in the browser. jitless
// skips both: the same results, by zod's ordinary parser. Set before any schema
// is made (it is read when one is), which importing z from here guarantees.
z.config({ jitless: true });

export { z };
