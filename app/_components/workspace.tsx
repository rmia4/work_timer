"use client";
import { useEffect, useState } from "react";
import Login from "./login";
import { useWorkspace } from "./use-workspace";
import { WorkspaceDialogs, type LayoutProps } from "./workspace-parts";
import DefaultLayout from "./layouts/default-layout";
import MinimalLayout from "./layouts/minimal-layout";
import DashboardLayout from "./layouts/dashboard-layout";
import SidebarLayout from "./layouts/sidebar-layout";
import TabsLayout from "./layouts/tabs-layout";
import FocusLayout from "./layouts/focus-layout";
import { DEFAULT_LAYOUT, isLayoutId, type LayoutId } from "../../lib/layouts";

const LAYOUT_COMPONENTS: Record<LayoutId, (props: LayoutProps) => React.ReactNode> = {
  default: DefaultLayout,
  minimal: MinimalLayout,
  dashboard: DashboardLayout,
  sidebar: SidebarLayout,
  tabs: TabsLayout,
  focus: FocusLayout,
};

export default function Workspace() {
  const ws = useWorkspace();
  // 계정에 저장된 화면 레이아웃. 불러오기 전에는 화면을 그리지 않아 기본 화면이 잠깐 보이지 않게 한다.
  const [layout, setLayout] = useState<LayoutId | null>(null);
  const signedIn = !ws.auth;
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { layout?: unknown } | null) => {
        if (alive) setLayout(isLayoutId(data?.layout) ? data.layout : DEFAULT_LAYOUT);
      })
      .catch(() => alive && setLayout(DEFAULT_LAYOUT));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  async function changeLayout(next: LayoutId) {
    const previous = layout;
    setLayout(next);
    try {
      const r = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: next }),
      });
      if (!r.ok) throw Error();
      return true;
    } catch {
      setLayout(previous);
      return false;
    }
  }

  if (ws.auth) return <Login onSuccess={ws.load} />;
  if (!layout) return <div className="shell" aria-busy="true" />;
  const Layout = LAYOUT_COMPONENTS[layout];
  return (
    <>
      <Layout ws={ws} layout={layout} onLayoutChange={changeLayout} />
      <WorkspaceDialogs ws={ws} />
    </>
  );
}
