import { describe, test, expect } from "vitest";
import { BASE_URL, parseJobCards, parseJobDetail, resolveJobType, resolveArea } from "../src/helpers";

// Minimal card markup mirroring the real structure fetched live from
// green-japan.com/jobtype-l/190100 on 2026-07-26.
function card(companyId: string, jobId: string, title: string, company = "Acme Inc."): string {
  return `<div class="card-info__wrapper js-card-info__wrapper">
    <a target="_blank" class="js-search-result-box card-info " href="/company/${companyId}/job/${jobId}">
      <div class="card-info__tag-area clearfix">
        <div class="job-offer-icon">エンジニア</div>
        <span class="update">2026/07/01 更新</span>
      </div>
      <div class="card-info__heading-area">
        <h3 class="card-info__heading-area__title">${title}</h3>
      </div>
      <div class="card-info__detail-area">
        <ul class="job-offer-meta-tags">
          <li><span class="icon-salary"></span>500万円〜700万円<br /></li>
          <li><span class="icon-site"></span>東京都，神奈川県</li>
          <li><span class="icon-code"></span>
            <span class="code-tag">TypeScript</span>
            <span class="code-tag">React</span>
          </li>
        </ul>
        <div class="card-info__detail-area__box">
          <div class="card-info__detail-area__box__heading">
            <h3 class="card-info__detail-area__box__title">${company}</h3>
          </div>
        </div>
      </div>
    </a>
  </div>`;
}

describe("parseJobCards", () => {
  test("extracts id, title, company, location, salary, tags, date, url", () => {
    const html = card("999999901", "999999902", "Senior Engineer");
    const [c] = parseJobCards(html);
    expect(c.id).toBe("999999901/999999902");
    expect(c.title).toBe("Senior Engineer");
    expect(c.company).toBe("Acme Inc.");
    expect(c.location).toBe("東京都，神奈川県");
    expect(c.salary).toBe("500万円〜700万円");
    expect(c.tags).toEqual(["TypeScript", "React"]);
    expect(c.date).toBe("2026/07/01");
    expect(c.url).toBe(`${BASE_URL}/company/999999901/job/999999902`);
  });

  test("one malformed card (no title) does not break parsing of the rest", () => {
    const broken = `<div class="card-info__wrapper js-card-info__wrapper">
      <a href="/company/1/job/2"></a>
    </div>`;
    const good = card("3", "4", "Backend Engineer");
    const [c] = parseJobCards(broken + good);
    expect(c.id).toBe("3/4");
    expect(c.title).toBe("Backend Engineer");
  });

  test("decodes HTML entities in the title", () => {
    const html = card("1", "2", "Caf&#xE9; App Engineer");
    const [c] = parseJobCards(html);
    expect(c.title).toBe("Café App Engineer");
  });

  test("returns empty array for a page with no cards", () => {
    expect(parseJobCards("<html><body>no jobs</body></html>")).toEqual([]);
  });
});

describe("parseJobDetail", () => {
  function nextDataPage(jobOffer: Record<string, unknown>, client: Record<string, unknown> = {}): string {
    const json = JSON.stringify({ props: { pageProps: { jobOffer, client } } });
    return `<html><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
  }

  test("reads title, company, salary, location, tags, description from embedded JSON", () => {
    const html = nextDataPage(
      {
        title: "Backend Engineer",
        summary: "Build APIs",
        minSalary: 500,
        maxSalary: 800,
        salaryDetail: "Details here",
        employmentStatusName: "正社員",
        areas: [{ id: 13, name: "東京都" }],
        tags: [{ id: 1, name: "Go" }],
        qualification: "3+ years",
        renewedAtTimestamp: 1750000000,
      },
      { fullName: "Acme K.K." },
    );
    const job = parseJobDetail(html, "10", "20");
    expect(job?.title).toBe("Backend Engineer");
    expect(job?.company).toBe("Acme K.K.");
    expect(job?.location).toBe("東京都");
    expect(job?.salary).toBe("500万円〜800万円");
    expect(job?.tags).toEqual(["Go"]);
    expect(job?.description).toContain("Build APIs");
    expect(job?.qualification).toBe("3+ years");
    expect(job?.employmentType).toBe("正社員");
    expect(job?.id).toBe("10/20");
  });

  test("returns null when __NEXT_DATA__ is missing", () => {
    expect(parseJobDetail("<html><body>no data</body></html>", "1", "2")).toBeNull();
  });

  test("returns null when __NEXT_DATA__ has no jobOffer", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: {} } })}</script>`;
    expect(parseJobDetail(html, "1", "2")).toBeNull();
  });
});

describe("resolveJobType", () => {
  test("exact English key", () => {
    expect(resolveJobType("backend")?.code).toBe("190100");
  });
  test("exact Japanese key", () => {
    expect(resolveJobType("フロントエンド")?.code).toBe("190101");
  });
  test("full-stack maps to backend (no dedicated category)", () => {
    expect(resolveJobType("フルスタック")?.code).toBe("190100");
  });
  test("substring match", () => {
    expect(resolveJobType("バックエンドエンジニア募集")?.code).toBe("190100");
  });
  test("unmapped query returns null", () => {
    expect(resolveJobType("astronaut")).toBeNull();
  });
});

describe("resolveArea", () => {
  test("resolves a known prefecture", () => {
    expect(resolveArea("Tokyo")).toEqual({ kind: "area", code: "13" });
  });
  test("resolves a Japanese prefecture name", () => {
    expect(resolveArea("大阪")).toEqual({ kind: "area", code: "27" });
  });
  test("resolves remote aliases", () => {
    expect(resolveArea("remote")).toEqual({ kind: "remote" });
    expect(resolveArea("リモート")).toEqual({ kind: "remote" });
  });
  test("unmapped location returns null", () => {
    expect(resolveArea("Narnia")).toBeNull();
  });
});
