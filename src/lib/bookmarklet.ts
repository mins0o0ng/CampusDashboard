// bookmarklet.ts
// 용도: 생협 사이트(coop.knu.ac.kr)에서 누르면 모든 식당의 식단 페이지를 모아 한 번에 복사하는 북마클릿.
//       관리자의 브라우저(국내 IP)에서 같은 사이트 안의 페이지를 불러오므로 해외 IP 차단·CORS 문제가 없다.
//       결과는 mealImport.ts 의 CoopBundle 형식(JSON)이며, 식단표 가져오기 창에 붙여넣으면 된다.
//
// 주의: collect 는 문자열로 직렬화되어 생협 페이지에서 실행된다. 바깥 변수·import 를 참조하면 안 된다.

async function collect(): Promise<void> {
  const TYPE = "campus-coop-bundle";

  const panel = document.createElement("div");
  panel.setAttribute(
    "style",
    "position:fixed;top:16px;right:16px;z-index:2147483647;width:360px;padding:16px;border-radius:12px;" +
      "background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);font:13px/1.5 sans-serif"
  );
  const msg = document.createElement("p");
  msg.style.margin = "0";
  panel.appendChild(msg);
  const close = document.createElement("button");
  close.textContent = "닫기";
  close.setAttribute("style", "margin-top:8px;padding:4px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer");
  close.onclick = () => panel.remove();
  document.body.appendChild(panel);
  const say = (text: string) => (msg.textContent = text);

  if (!/coop\.knu\.ac\.kr$/.test(location.hostname)) {
    say("경북대 생협 식단 페이지(coop.knu.ac.kr)에서 눌러 주세요.");
    panel.appendChild(close);
    return;
  }

  // 메뉴에 있는 식당 링크(이미지 링크 제외, 글자가 있는 것) → 코드·이름
  const found = new Map<string, string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href*="shop_sqno="]').forEach((a) => {
    const m = (a.getAttribute("href") ?? "").match(/shop_sqno=(\d+)/);
    const name = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (m && (!found.has(m[1]) || (!found.get(m[1]) && name))) found.set(m[1], name);
  });
  const current = new URLSearchParams(location.search).get("shop_sqno");
  if (current && !found.has(current)) found.set(current, "");
  if (found.size === 0) {
    say("식당 목록을 찾지 못했어요. 생협 '식당메뉴' 페이지에서 눌러 주세요.");
    panel.appendChild(close);
    return;
  }

  const shops: { code: number; name: string; html: string }[] = [];
  let i = 0;
  for (const [code, linkName] of found) {
    say(`식단 모으는 중… (${++i}/${found.size})`);
    try {
      const res = await fetch(`/sub03/sub01_01.html?shop_sqno=${code}`, { credentials: "same-origin" });
      const buf = await res.arrayBuffer();
      let html = new TextDecoder("utf-8").decode(buf);
      if (html.includes("�")) html = new TextDecoder("euc-kr").decode(buf);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const title = (doc.querySelector(".s_Title h2")?.textContent ?? "").trim();
      const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
      const range = (text.match(/20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*~\s*20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}/) ?? [""])[0];
      // 식단에 필요한 부분(주 날짜 + 표)만 담아 크기를 줄인다.
      const tables = Array.from(doc.querySelectorAll("table")).map((t) => t.outerHTML).join("");
      if (tables) shops.push({ code: Number(code), name: title || linkName || `식당 ${code}`, html: `<p>${range}</p>${tables}` });
    } catch {
      /* 한 식당 실패는 건너뛴다 */
    }
  }

  const json = JSON.stringify({ type: TYPE, v: 1, shops });
  try {
    await navigator.clipboard.writeText(json);
    say(`✓ 식당 ${shops.length}곳 식단을 복사했어요. 캠퍼스 보드 '생협 페이지 붙여넣기' 창에 Ctrl+V 하세요.`);
  } catch {
    // 불러오는 동안 클릭 권한이 만료되면 자동 복사가 막힌다 → 직접 복사하도록 보여 준다.
    say(`식당 ${shops.length}곳을 모았어요. 아래 상자가 선택된 상태에서 Ctrl+C 를 누른 뒤 캠퍼스 보드에 붙여넣으세요.`);
    const ta = document.createElement("textarea");
    ta.value = json;
    ta.setAttribute("style", "width:100%;height:80px;margin-top:8px;font-size:11px");
    panel.appendChild(ta);
    ta.focus();
    ta.select();
  }
  panel.appendChild(close);
}

// #·% 같은 문자가 URL 로 해석되지 않도록 인코딩한다(브라우저가 실행 전에 디코딩).
export const BOOKMARKLET_HREF = "javascript:" + encodeURIComponent(`(${collect.toString()})();void 0`);
