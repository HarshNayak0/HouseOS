import { describe, expect, it } from "vitest";
import { captionByRules, extractJsonLdRecipe, formatQty, htmlToText, isoMinutes, parseIngredient, parseQty } from "../../supabase/functions/_shared/recipe";

describe("quantities", () => {
  it("parses fractions, mixed numbers, unicode and ranges", () => {
    expect(parseQty("1 1/2")).toBe(1.5);
    expect(parseQty("½")).toBe(0.5);
    expect(parseQty("1½")).toBe(1.5);
    expect(parseQty("2-3")).toBe(2);
    expect(parseQty("0.25")).toBe(0.25);
    expect(parseQty("abc")).toBeNull();
  });
  it("formats friendly fractions", () => {
    expect(formatQty(1.5)).toBe("1 ½");
    expect(formatQty(0.333)).toBe("⅓");
    expect(formatQty(2)).toBe("2");
    expect(formatQty(0.99)).toBe("1");
    expect(formatQty(null)).toBe("");
    expect(formatQty(0.13)).toBe("⅛");
    expect(formatQty(2.4)).toBe("2.4");
    expect(formatQty(0.625)).toBe("⅝");
  });
});

describe("ingredient lines", () => {
  it.each([
    ["2 ½ cups basmati rice, rinsed", { qty: 2.5, unit: "cup", item: "basmati rice", note: "rinsed" }],
    ["1 tsp turmeric", { qty: 1, unit: "tsp", item: "turmeric", note: null }],
    ["3 cloves garlic (crushed)", { qty: 3, unit: "clove", item: "garlic", note: "crushed" }],
    ["400 g chicken thighs", { qty: 400, unit: "g", item: "chicken thighs", note: null }],
    ["• a few curry leaves", { qty: null, unit: null, item: "a few curry leaves", note: null }],
    ["Salt to taste", { qty: null, unit: null, item: "Salt to taste", note: null }],
    ["1 can of coconut milk", { qty: 1, unit: "can", item: "coconut milk", note: null }],
  ])("%s", (line, want) => {
    expect(parseIngredient(line)).toMatchObject(want);
  });
});

describe("JSON-LD extraction", () => {
  const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>x</body></html>`;
  it("reads a plain Recipe", () => {
    const r = extractJsonLdRecipe(
      page({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Kerala Fish Curry",
        image: ["https://ex.com/a.jpg"],
        author: { "@type": "Person", name: "Maria" },
        recipeYield: "4 servings",
        prepTime: "PT15M",
        cookTime: "PT1H5M",
        recipeCategory: "Dinner",
        recipeCuisine: "Indian",
        keywords: "fish, curry",
        recipeIngredient: ["500 g kingfish", "1 tbsp coconut oil"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Marinate the fish." }, { "@type": "HowToStep", text: "Simmer &amp; serve." }],
      }),
      "https://ex.com/fish",
    )!;
    expect(r).toMatchObject({ title: "Kerala Fish Curry", servings: 4, prep_min: 15, cook_min: 65, creator: "Maria", image_url: "https://ex.com/a.jpg", method: "json-ld" });
    expect(r.ingredients[0]).toMatchObject({ qty: 500, unit: "g", item: "kingfish" });
    expect(r.steps).toEqual(["Marinate the fish.", "Simmer & serve."]);
    expect(r.tags).toEqual(["Dinner", "Indian", "fish", "curry"]);
  });
  it("finds a Recipe inside @graph with sections and an image object", () => {
    const r = extractJsonLdRecipe(
      page({
        "@graph": [
          { "@type": "WebSite", name: "Blog" },
          {
            "@type": ["Recipe", "NewsArticle"],
            name: "Appam",
            image: { "@type": "ImageObject", url: "https://ex.com/appam.jpg" },
            recipeInstructions: [{ "@type": "HowToSection", name: "Batter", itemListElement: [{ text: "Soak rice." }, { text: "Grind." }] }],
            recipeIngredient: "2 cups raw rice",
          },
        ],
      }),
      "https://ex.com/appam",
    )!;
    expect(r.title).toBe("Appam");
    expect(r.image_url).toBe("https://ex.com/appam.jpg");
    expect(r.steps).toEqual(["Soak rice.", "Grind."]);
  });
  it("returns null without recipe data, and skips broken JSON", () => {
    expect(extractJsonLdRecipe('<script type="application/ld+json">{broken</script>', "https://x")).toBeNull();
    expect(extractJsonLdRecipe(page({ "@type": "Article" }), "https://x")).toBeNull();
  });
  it("parses durations", () => {
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("P0DT0H45M")).toBe(45);
    expect(isoMinutes("soon")).toBeNull();
  });
  it("turns a page into plain text for the AI fallback", () => {
    expect(htmlToText("<style>x{}</style><h1>Puttu</h1><script>bad()</script><p>Steam it.</p>")).toBe("Puttu Steam it.");
  });
});

describe("caption fallback (no AI)", () => {
  it("splits amounts from steps and finds the creator", () => {
    const d = captionByRules("Easy mango lassi 🥭\n1 cup mango pulp\n½ cup yogurt\n2 tbsp sugar\nBlend everything until smooth.\nServe chilled!\n#lassi #summer\nRecipe by @chef.anu", null);
    expect(d.title).toBe("Easy mango lassi 🥭");
    expect(d.ingredients.map((i) => i.item)).toEqual(["mango pulp", "yogurt", "sugar"]);
    expect(d.steps).toContain("Blend everything until smooth.");
    expect(d.creator).toBe("@chef.anu");
    expect(d.ingredients.every((i) => i.confidence < 0.7)).toBe(true);
  });
});

import { isInstagram, isSafePublicUrl, normalizeAiDraft } from "../../supabase/functions/_shared/recipe";

describe("AI answer validation", () => {
  it("keeps good fields and flags missing amounts", () => {
    const d = normalizeAiDraft(
      {
        title: "Mango lassi",
        servings: 2,
        prep_min: 5.4,
        tags: ["Drinks", 7, ""],
        ingredients: [
          { qty: 1, unit: "cup", item: "mango pulp", confidence: 0.95 },
          { qty: null, unit: null, item: "cardamom", confidence: 0.9 },
          { qty: -3, item: "sugar", confidence: 2 },
          { item: "" },
          "junk",
        ],
        steps: ["Blend.", 5, "  "],
        confidence: { title: 0.9, servings: 0.8, times: 0.4, steps: 0.9 },
      },
      "https://www.instagram.com/reel/x",
    )!;
    expect(d.ingredients).toHaveLength(3);
    expect(d.ingredients[1]).toMatchObject({ item: "cardamom", qty: null, confidence: 0.5 });
    expect(d.ingredients[2]).toMatchObject({ item: "sugar", qty: null });
    expect(d.prep_min).toBe(5);
    expect(d.tags).toEqual(["Drinks"]);
    expect(d.steps).toEqual(["Blend."]);
    expect(d.method).toBe("gemini");
  });
  it("rejects empty or non-object answers", () => {
    expect(normalizeAiDraft({ title: "", ingredients: [], steps: [] }, null)).toBeNull();
    expect(normalizeAiDraft("nope", null)).toBeNull();
  });
});

describe("link checks", () => {
  it("recognises Instagram links", () => {
    expect(isInstagram("https://www.instagram.com/reel/abc/")).toBe(true);
    expect(isInstagram("https://example.com/instagram.com")).toBe(false);
  });
  it("refuses local and private addresses", () => {
    expect(isSafePublicUrl("https://www.seriouseats.com/x")).toBe(true);
    for (const bad of ["http://localhost:3000", "http://169.254.169.254/latest", "http://10.0.0.1/", "https://[::1]/", "ftp://x.com/a", "https://user:pw@x.com", "http://intranet/"])
      expect(isSafePublicUrl(bad)).toBe(false);
  });
});

import { validateScreenshots } from "../../supabase/functions/_shared/recipe";

describe("screenshot checks", () => {
  const img = { mime: "image/webp", data: "UklGRg==" };
  it("accepts up to 4 real images", () => {
    expect(validateScreenshots([img, img])).toHaveLength(2);
    expect(validateScreenshots(undefined)).toEqual([]);
  });
  it("rejects too many, wrong types, bad data and huge files", () => {
    expect(validateScreenshots([img, img, img, img, img])).toBe("Up to 4 screenshots at a time");
    expect(validateScreenshots([{ mime: "application/pdf", data: "AAAA" }])).toBe("Screenshots must be images");
    expect(validateScreenshots([{ mime: "image/png", data: "not base64!" }])).toBe("Bad screenshot data");
    expect(validateScreenshots([{ mime: "image/png", data: "A".repeat(2_100_000) }])).toMatch(/too large/);
  });
});
