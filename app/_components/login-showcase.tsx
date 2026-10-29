"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { ClockPreview, TimerPreview, features } from "./login-preview";
import { CodexConnectDialog, openClaudeConnect } from "./workspace-parts";

// 로그인 화면 아래 소개: 웹 핵심 기능 + 다른 사용 환경(MCP·Android·크롬) 탭
type ChannelId = "mcp" | "android" | "chrome";
const channels: {
  id: ChannelId;
  name: string;
  tagline: string;
  body: string;
  points: string[];
  link?: { label: string; href: string };
}[] = [
  {
    id: "mcp",
    name: "AI 연결 (MCP)",
    tagline: "Claude·Codex에게 맡기기",
    body: "“이번 주 한 일 요약해 줘”, “회의 타이머 시작해 줘”처럼 말로 기록을 다룹니다.",
    points: ["OAuth 로그인·동의", "조회/쓰기 권한 분리", "요약 프롬프트 제공"],
  },
  {
    id: "android",
    name: "Android 앱",
    tagline: "이동 중에도 이어서",
    body: "PC에서 시작한 작업을 휴대폰에서 일시정지하고 마무리합니다. 원스토어에서 설치할 수 있습니다.",
    points: ["같은 계정·같은 기록", "진행 중 타이머 확인", "로그인 유지"],
    link: {
      label: "원스토어에서 설치",
      href: "https://m.onestore.co.kr/v2/ko-kr/app/0001011397",
    },
  },
  {
    id: "chrome",
    name: "크롬 확장",
    tagline: "툴바에서 바로",
    body: "탭을 옮기지 않고 툴바 팝업에서 타이머·일지·메모를 다룹니다.",
    points: ["팝업에서 시작·종료", "일지·메모·요약", "다크·라이트 테마"],
    link: {
      label: "Chrome 웹 스토어에서 설치",
      href: "https://chromewebstore.google.com/detail/work-timer/jmjmjgjgfoohdccinophdpejdobhnfoi",
    },
  },
];

function MiniTimer({ title }: { title: string }) {
  return (
    <div className="login-mini-timer">
      <span className="login-mini-dot" /> 진행 중
      <strong>01:42:18</strong>
      <p>{title}</p>
      <div className="login-mini-actions">
        <span>일시정지</span>
        <span className="on">종료</span>
      </div>
    </div>
  );
}

function McpVisual() {
  // 메인 화면 상단 AI 연결 메뉴와 같은 동작
  const [codexOpen, setCodexOpen] = useState(false);
  return (
    <div className="login-mcp">
      <div className="login-chat" aria-hidden="true">
        <p className="me">고객 문의 답변 작업 기록 시작해 줘</p>
        <p className="ai">
          <span className="tool">worktimer · start_work</span>
          <b>고객 문의 답변</b> 타이머를 시작했어요. 끝나면 말씀해 주세요.
        </p>
        <p className="me">이번 주 한 일 요약해 줘</p>
        <p className="ai">
          <span className="tool">worktimer · export_tasks</span>
          이번 주 18시간 40분, 기록 12건입니다. 가장 많은 시간은 <b>API 응답 속도 개선</b>(6시간
          10분)에 썼어요.
        </p>
      </div>
      <div className="login-connect">
        <button type="button" className="primary" onClick={openClaudeConnect}>
          Claude에 연결
        </button>
        <button type="button" onClick={() => setCodexOpen(true)}>
          Codex에 연결
        </button>
      </div>
      <CodexConnectDialog open={codexOpen} onOpenChange={setCodexOpen} />
    </div>
  );
}

function PhoneVisual() {
  return (
    <div className="login-phone" aria-hidden="true">
      <div className="login-phone-notch" />
      <small>업무 기록</small>
      <MiniTimer title="거래처 미팅 정리" />
      <ul>
        <li>
          <span>주간 보고서 작성</span>
          <b>1:42</b>
        </li>
        <li>
          <span>디자인 리뷰 미팅</span>
          <b>0:48</b>
        </li>
      </ul>
    </div>
  );
}

function BrowserVisual() {
  return (
    <div className="login-browser" aria-hidden="true">
      <div className="login-browser-bar">
        <span className="login-browser-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="login-browser-url">docs.google.com/document/…</span>
        <span className="login-browser-ext">
          <img src="/favicon.svg" alt="" width="16" height="16" />
        </span>
      </div>
      <div className="login-popup">
        <div className="login-popup-bar">
          <span className="on">타이머</span>
          <span>일지</span>
          <span>메모</span>
          <span>요약</span>
        </div>
        <MiniTimer title="스프린트 회의 준비" />
      </div>
    </div>
  );
}

export default function LoginShowcase() {
  const [active, setActive] = useState<ChannelId>("mcp");
  const c = channels.find((x) => x.id === active)!;
  return (
    <>
      <section className="login-section login-core" aria-labelledby="login-core-title">
        <div>
          <span className="login-eyebrow">모든 기록의 중심</span>
          <h2 id="login-core-title" className="login-section-title">하루의 업무가 한 화면에</h2>
          <ul className="login-core-list">
            {features.map((f) => (
              <li key={f.title}>
                <strong>{f.title}</strong>
                <span>{f.body}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="login-core-visual">
          <TimerPreview />
          <ClockPreview />
        </div>
      </section>

      <section className="login-section" aria-labelledby="login-channel-title">
        <h2 id="login-channel-title" className="login-section-title">같은 기록, 어디서든</h2>
        <div className="login-feature-tabs" role="tablist" aria-label="사용 환경">
          {channels.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`login-channel-tab-${x.id}`}
              aria-selected={x.id === active}
              aria-controls="login-channel-panel"
              className={x.id === active ? "on" : ""}
              onClick={() => setActive(x.id)}
            >
              {x.name}
            </button>
          ))}
        </div>
        <div
          className="login-feature-panel login-channel-panel"
          role="tabpanel"
          id="login-channel-panel"
          aria-labelledby={`login-channel-tab-${active}`}
          key={active}
        >
          <div className="login-channel-text">
            <h3>{c.tagline}</h3>
            <p>{c.body}</p>
            <ul>
              {c.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {c.link && (
              <a
                className="login-link-button"
                href={c.link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.link.label}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="login-channel-visual">
            {active === "mcp" ? (
              <McpVisual />
            ) : active === "android" ? (
              <PhoneVisual />
            ) : (
              <BrowserVisual />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
