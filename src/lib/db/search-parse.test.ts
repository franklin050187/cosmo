import { describe, expect, it } from "vitest";
import { filtersFromQueryString } from "./search-parse";

describe("filtersFromQueryString", () => {
  it("parses order, dir, page and q", () => {
    const { filters, page } = filtersFromQueryString("order=fav&dir=asc&page=3&q=frigate");
    expect(filters.order).toBe("fav");
    expect(filters.dir).toBe("asc");
    expect(page).toBe(3);
    expect(filters.desc).toBe("frigate");
  });

  it("parses scalar and numeric filters", () => {
    const { filters } = filtersFromQueryString("author=john&minprice=10&max-crew=8");
    expect(filters.author).toBe("john");
    expect(filters.minprice).toBe("10");
    expect(filters["max-crew"]).toBe("8");
  });

  it("ignores non-numeric numeric filters instead of erroring in Postgres", () => {
    const { filters } = filtersFromQueryString("minprice=abc");
    expect(filters.minprice).toBeUndefined();
  });

  it("parses explicit tag/notag params", () => {
    const { filters } = filtersFromQueryString("tag=HeavyArmor&tag=Turret&notag=Civilian");
    expect(filters.tagsOn).toEqual(["HeavyArmor", "Turret"]);
    expect(filters.tagsOff).toEqual(["Civilian"]);
  });

  it("parses legacy bare tag toggles", () => {
    const { filters } = filtersFromQueryString("HeavyArmor=1&Civilian=0");
    expect(filters.tagsOn).toEqual(["HeavyArmor"]);
    expect(filters.tagsOff).toEqual(["Civilian"]);
  });

  it("regression: just_logged_in=1 from the OAuth callback must not become a tag filter", () => {
    // Previously ?order=fav&just_logged_in=1 parsed tagsOn: ["just_logged_in"],
    // which matched no ship and returned zero results after login.
    const { filters } = filtersFromQueryString("order=fav&just_logged_in=1");
    expect(filters.tagsOn).toBeUndefined();
    expect(filters.tagsOff).toBeUndefined();
    expect(filters.order).toBe("fav");
  });

  it("never treats reserved keys as legacy tags", () => {
    const { filters } = filtersFromQueryString(
      "page=2&order=new&dir=asc&q=x&tag=a&notag=b&author=x&desc=x&minprice=1&maxprice=1&min-crew=1&max-crew=1&fulltext=x&brand=exl&just_logged_in=1",
    );
    expect(filters.tagsOn).toEqual(["a"]);
    expect(filters.tagsOff).toEqual(["b"]);
  });

  it("defaults page to 1 on garbage input", () => {
    const { page } = filtersFromQueryString("page=abc");
    expect(page).toBe(1);
  });

  it("handles empty and undefined query strings", () => {
    expect(filtersFromQueryString("").filters).toEqual({ page: 1 });
    expect(filtersFromQueryString(undefined as unknown as string).filters).toEqual({ page: 1 });
  });
});
