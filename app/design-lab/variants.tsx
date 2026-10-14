"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Puzzle, Smartphone } from "lucide-react";
import LoginPreview from "../_components/login-preview";

// 모든 변형이 같은 데이터를 쓴다 (공정한 비교용)
export const links = {
  owner: "rmia4",
  github: "https://github.com/rmia4",
  repo: "rmia4/work_timer",
  repoUrl: "https://github.com/rmia4/work_timer",
  chrome: "#chrome-web-store", // 실제 웹스토어 주소로 교체
};

export function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function SoonBadge() {
  return <span className="dl-soon">준비 중</span>;
}

function HeaderGithub() {
  return (
    <a className="dl-icon-link" href={links.github} target="_blank" rel="noreferrer" aria-label="GitHub (새 창)">
      <GithubMark size={20} />
    </a>
  );
}

// 로그인 화면 뼈대: 실제 login.tsx 마크업·클래스를 정적으로 재현
function Frame({
  headerRight,
  afterTitle,
  afterPreview,
  afterCard,
  footer,
}: {
  headerRight?: ReactNode;
  afterTitle?: ReactNode;
  afterPreview?: ReactNode;
  afterCard?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="shell dl-frame">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
        {headerRight && <div className="dl-top-right">{headerRight}</div>}
      </header>
      <main className="login-page">
        <div className="login-wrap">
          <section className="login-intro" aria-label="기능 소개">
            <h1 className="login-title">작업 시간과 일지를 한곳에서.</h1>
            {afterTitle}
            <LoginPreview />
            {afterPreview}
          </section>
          <div className="dl-card-col">
            <section className="login-card">
              <div className="login-mode-tabs" role="tablist">
                <button type="button" role="tab" aria-selected="true" className="on">
                  로그인
                </button>
                <button type="button" role="tab" aria-selected="false">
                  회원가입
                </button>
              </div>
              <p className="login-hint">아이디와 비밀번호를 입력해 주세요.</p>
              <form onSubmit={(e) => e.preventDefault()}>
                <label>
                  아이디
                  <input type="text" readOnly />
                </label>
                <label>
                  비밀번호
                  <input type="password" readOnly />
                </label>
                <button className="primary" type="submit">
                  로그인
                </button>
              </form>
            </section>
            {afterCard}
          </div>
        </div>
        {footer}
      </main>
    </div>
  );
}

/* A. 정보 위계: 만든 사람은 헤더, 설치할 것은 로그인 카드 바로 아래 */
export function VariantA() {
  return (
    <Frame
      headerRight={<HeaderGithub />}
      afterCard={
        <div className="dl-a-list">
          <p className="dl-a-label">다른 곳에서도 쓰기</p>
          <a className="dl-a-row" href={links.chrome}>
            <Puzzle size={16} />
            <span>크롬 확장</span>
            <span className="dl-a-action">
              Chrome에 추가 <ArrowUpRight size={14} />
            </span>
          </a>
          <div className="dl-a-row is-disabled" aria-disabled="true">
            <Smartphone size={16} />
            <span>모바일 앱</span>
            <SoonBadge />
          </div>
        </div>
      }
    />
  );
}

/* B. 레이아웃: 화면 맨 아래 3열 푸터로 분리 */
export function VariantB() {
  return (
    <Frame
      footer={
        <footer className="dl-b-footer">
          <div className="dl-b-inner">
            <div>
              <p className="dl-b-head">만든 사람</p>
              <a href={links.github} target="_blank" rel="noreferrer" className="dl-b-link">
                <GithubMark size={15} /> @{links.owner}
              </a>
            </div>
            <div>
              <p className="dl-b-head">크롬 확장</p>
              <p className="dl-b-body">툴바에서 바로 타이머를 켜고 끕니다.</p>
              <a href={links.chrome} className="dl-b-link">
                Chrome 웹 스토어 <ArrowUpRight size={14} />
              </a>
            </div>
            <div>
              <p className="dl-b-head">
                모바일 앱 <SoonBadge />
              </p>
              <p className="dl-b-body">iOS·Android 앱을 만들고 있습니다.</p>
            </div>
          </div>
        </footer>
      }
    />
  );
}

/* C. 밀도: 제목 아래 모노스페이스 한 줄 */
export function VariantC() {
  return (
    <Frame
      afterTitle={
        <p className="dl-c-line">
          <a href={links.repoUrl} target="_blank" rel="noreferrer">
            <GithubMark size={13} /> {links.repo}
          </a>
          <span aria-hidden="true">·</span>
          <a href={links.chrome}>
            <Puzzle size={13} /> chrome-extension
          </a>
          <span aria-hidden="true">·</span>
          <span className="dl-c-muted">
            <Smartphone size={13} /> mobile — 준비 중
          </span>
        </p>
      }
    />
  );
}

/* D. 상호작용: 평소엔 숨기고 헤더 버튼으로 펼침 */
function PlatformMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="dl-d-wrap" ref={ref}>
      <button type="button" className="dl-d-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        앱 · 확장 <ChevronDown size={15} className={open ? "dl-rot" : ""} />
      </button>
      {open && (
        <div className="dl-d-panel">
          <a href={links.chrome} className="dl-d-item">
            <Puzzle size={18} />
            <span>
              <strong>크롬 확장</strong>
              <small>툴바에서 타이머 조작</small>
            </span>
            <ArrowUpRight size={14} />
          </a>
          <div aria-disabled="true" className="dl-d-item is-disabled">
            <Smartphone size={18} />
            <span>
              <strong>모바일 앱</strong>
              <small>iOS·Android</small>
            </span>
            <SoonBadge />
          </div>
          <hr />
          <a href={links.github} target="_blank" rel="noreferrer" className="dl-d-item">
            <GithubMark size={18} />
            <span>
              <strong>GitHub</strong>
              <small>@{links.owner}</small>
            </span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </div>
  );
}

export function VariantD() {
  return <Frame headerRight={<PlatformMenu />} />;
}

/* E. 표현: 미리보기 아래 개발자풍 카드 3개 */
export function VariantE() {
  return (
    <Frame
      headerRight={<HeaderGithub />}
      afterPreview={
        <div className="dl-e-grid">
          <a className="dl-e-card" href={links.repoUrl} target="_blank" rel="noreferrer">
            <code>repo</code>
            <strong>
              <GithubMark size={15} /> {links.repo}
            </strong>
            <p>소스 코드 보기</p>
          </a>
          <a className="dl-e-card" href={links.chrome}>
            <code>extension</code>
            <strong>
              <Puzzle size={15} /> 크롬 확장
            </strong>
            <p>툴바에서 바로 시작·정지</p>
          </a>
          <div className="dl-e-card is-disabled" aria-disabled="true">
            <code>mobile</code>
            <strong>
              <Smartphone size={15} /> 모바일 앱 <SoonBadge />
            </strong>
            <p>iOS·Android 준비 중</p>
          </div>
        </div>
      }
    />
  );
}
