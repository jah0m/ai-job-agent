import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail, resolveJobType, resolveArea } from "../src/helpers";

// Minimal card markup mirroring the real structure fetched live from
// geekly.co.jp/search/joblist/ on 2026-07-26.
function card(id: string, title: string, company = "Acme Inc.", salary = "500～800", location = "東京都渋谷区"): string {
  return `<section class="recruitment_item ">
    <div class="recruitment_item_inner">
      <div class="recruitment_head">
        <div class="company_name">
          <a href="/companys/data/1/">${company}</a>
        </div>
        <h2>
          <a href="/search/detail/${id}/">${title}</a>
        </h2>
      </div>
      <ul class="recruitment_head_tags">
        <li><span>リモートワーク可</span></li>
        <li><span>私服可</span></li>
      </ul>
      <div class="recruitment_content_table">
        <dl class="content_area">
          <dt class="head_tag">年　収</dt>
          <dd class="content_text"><span class="is_hightlight">${salary}</span>万円</dd>
        </dl>
        <dl class="content_area">
          <dt class="head_tag">勤務地</dt>
          <dd class="content_text">${location}</dd>
        </dl>
      </div>
    </div>
  </section>`;
}

describe("parseJobCards", () => {
  test("extracts id, title, company, location, salary, tags, url", () => {
    const html = card("722884", "Senior Engineer");
    const [c] = parseJobCards(html);
    expect(c.id).toBe("722884");
    expect(c.title).toBe("Senior Engineer");
    expect(c.company).toBe("Acme Inc.");
    expect(c.location).toBe("東京都渋谷区");
    expect(c.salary).toBe("500～800万円");
    expect(c.tags).toEqual(["リモートワーク可", "私服可"]);
    expect(c.date).toBeNull();
    expect(c.url).toBe("https://www.geekly.co.jp/search/detail/722884/");
  });

  test("one malformed card (no title) does not break parsing of the rest", () => {
    const broken = `<section class="recruitment_item ">
      <div class="recruitment_head"><div class="company_name"><a href="#">X</a></div></div>
    </section>`;
    const good = card("999", "Backend Engineer");
    const [c] = parseJobCards(broken + good);
    expect(c.id).toBe("999");
    expect(c.title).toBe("Backend Engineer");
  });

  test("decodes HTML entities in the title", () => {
    const html = card("1", "Caf&#xE9; App Engineer");
    const [c] = parseJobCards(html);
    expect(c.title).toBe("Café App Engineer");
  });

  test("returns empty array for a page with no cards", () => {
    expect(parseJobCards("<html><body>no jobs</body></html>")).toEqual([]);
  });
});

describe("parseJobDetail", () => {
  function detailPage(fields: Record<string, string>, title = "Backend Engineer", company = "Acme K.K."): string {
    const dtdd = Object.entries(fields)
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join("\n");
    return `<html><body>
      <h1 class="recruit-head-contents__heading">${title}</h1>
      <a href="/companys/data/1/?job_link=1" class="recruit-head-contents__company-name">${company}</a>
      <dl class="recruit-main-job-description__requirements">
        ${dtdd}
      </dl>
    </body></html>`;
  }

  test("reads title, company, and dt/dd fields from the requirements dl", () => {
    const html = detailPage({
      "仕事内容": "Build APIs<br>and ship them",
      "必要なスキル": "Go, Python",
      "勤務地": "東京都品川区",
      "年収": "500～800万円",
      "休日・休暇": "完全週休二日制",
    });
    const job = parseJobDetail(html, "722884");
    expect(job?.title).toBe("Backend Engineer");
    expect(job?.company).toBe("Acme K.K.");
    expect(job?.location).toBe("東京都品川区");
    expect(job?.salary).toBe("500～800万円");
    expect(job?.description).toContain("Build APIs");
    expect(job?.description).toContain("and ship them");
    expect(job?.requiredSkills).toBe("Go, Python");
    expect(job?.holidays).toBe("完全週休二日制");
    expect(job?.id).toBe("722884");
  });

  test("returns null when the heading is missing", () => {
    expect(parseJobDetail("<html><body>no data</body></html>", "1")).toBeNull();
  });

  test("missing dl fields fall back to null rather than throwing", () => {
    const html = detailPage({ "仕事内容": "Build things" });
    const job = parseJobDetail(html, "1");
    expect(job?.description).toBe("Build things");
    expect(job?.location).toBeNull();
    expect(job?.salary).toBeNull();
  });
});

describe("resolveJobType", () => {
  test("exact key (role category)", () => {
    expect(resolveJobType("python")).toEqual({ param: "syo_id", code: "68", matchedKey: "python" });
  });
  test("full-stack routes to the dedicated tyu_id candidate tag", () => {
    expect(resolveJobType("フルスタック")).toEqual({
      param: "tyu_id",
      code: "182",
      matchedKey: "フルスタックエンジニア候補",
    });
    expect(resolveJobType("fullstack")?.param).toBe("tyu_id");
  });
  test("substring match", () => {
    expect(resolveJobType("python developer")?.code).toBe("68");
  });
  test("unmapped query returns null", () => {
    expect(resolveJobType("astronaut")).toBeNull();
  });
});

describe("resolveArea", () => {
  test("resolves a known prefecture", () => {
    expect(resolveArea("Tokyo")).toEqual({ code: "124", matchedKey: "tokyo" });
  });
  test("resolves a Japanese prefecture name", () => {
    expect(resolveArea("大阪")).toEqual({ code: "128", matchedKey: "大阪" });
  });
  test("resolves remote-ok vs full-remote distinctly", () => {
    expect(resolveArea("remote")?.code).toBe("144");
    expect(resolveArea("フルリモート")?.code).toBe("254");
  });
  test("unmapped location returns null", () => {
    expect(resolveArea("Narnia")).toBeNull();
  });
});
