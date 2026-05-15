import { describe, expect, test } from "bun:test";

import { router } from "../app/router.ts";

describe("Remix router", () => {
  test("renders the picker shell", async () => {
    const response = await router.fetch(new Request("http://localhost/"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Pinterest to mymind");
    expect(html).toContain("/assets/app/assets/entry.ts");
  });
});
