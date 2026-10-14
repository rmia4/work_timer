"use client";
import { useEffect, useState } from "react";
import { FeedbackOverlay } from "./FeedbackOverlay";
import { VariantA, VariantB, VariantC, VariantD, VariantE } from "./variants";
import "./design-lab.css";

const variants = [
  { id: "A", name: "정보 위계", why: "만든 사람(GitHub)은 헤더 아이콘, 설치할 것(확장·앱)은 로그인 카드 바로 아래 작은 목록.", C: VariantA },
  { id: "B", name: "레이아웃 분리", why: "본문은 그대로 두고 화면 맨 아래 3열 푸터에 모음. 스크롤해야 보임.", C: VariantB },
  { id: "C", name: "가장 촘촘하게", why: "제목 아래 모노스페이스 한 줄. 차지하는 공간이 가장 적고 개발자 느낌.", C: VariantC },
  { id: "D", name: "펼쳐 보기", why: "평소엔 헤더의 '앱 · 확장' 버튼만 보이고 누르면 드롭다운으로 세 항목.", C: VariantD },
  { id: "E", name: "개발자풍 카드", why: "미리보기 아래 repo / extension / mobile 카드 3개. 가장 잘 보이지만 여전히 테두리 위주.", C: VariantE },
] as const;

export default function DesignLabPage() {
  // 오버레이가 초기 렌더에서 localStorage를 읽어 SSR과 어긋나므로 마운트 후에만 그림
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return (
    <div className="dl-lab">
      <header className="dl-lab-head">
        <h1>Design Lab · 로그인 페이지 링크 영역</h1>
        <p>
          대상: <code>app/_components/login.tsx</code> · 은은하게 · 미니멀 + 개발자 느낌 · 다크 모드 지원
          <br />
          변형 5개를 위아래로 비교해 보세요. 오른쪽 아래 버튼으로 요소를 클릭해 의견을 남길 수 있습니다.
        </p>
        <nav>
          {variants.map((v) => (
            <a key={v.id} href={`#variant-${v.id}`}>
              {v.id}. {v.name}
            </a>
          ))}
        </nav>
      </header>
      {variants.map(({ id, name, why, C }) => (
        <section key={id} id={`variant-${id}`} className="dl-variant" data-variant={id}>
          <div className="dl-variant-head">
            <strong>
              {id}. {name}
            </strong>
            <span>{why}</span>
          </div>
          <div className="dl-variant-body">
            <C />
          </div>
        </section>
      ))}
      {mounted && <FeedbackOverlay targetName="LoginLinks" />}
    </div>
  );
}
