"use client";
import { useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LAYOUTS, type LayoutId } from "../../lib/layouts";
import ThemeToggle from "./theme-toggle";

export type DeleteKind = "tasks" | "memos" | "daily-memos";
const deleteLabels: Record<DeleteKind, { button: string; target: string }> = {
  tasks: { button: "업무일지 전체 삭제", target: "모든 업무일지 기록과 측정 시간이" },
  memos: { button: "전체 메모 삭제", target: "모든 메모가" },
  "daily-memos": { button: "전체 일일메모 삭제", target: "모든 날짜의 일일메모가" },
};
const DELETE_ACCOUNT_PHRASE = "계정 삭제";

type Connection = {
  id: string;
  name: string;
  host: string | null;
  scopes: string[];
  created: number;
  lastUsed: number | null;
};
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function SettingsDialog({
  disabled,
  onDeleted,
  layout,
  onLayoutChange,
}: {
  disabled?: boolean;
  onDeleted: (kind: DeleteKind) => void;
  layout: LayoutId;
  onLayoutChange: (layout: LayoutId) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("layout"),
    [layoutBusy, setLayoutBusy] = useState(false),
    [password, setPassword] = useState(""),
    [verified, setVerified] = useState(false),
    [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [confirmDelete, setConfirmDelete] = useState<DeleteKind | null>(null),
    [confirmAccount, setConfirmAccount] = useState(false),
    [accountPhrase, setAccountPhrase] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [connections, setConnections] = useState<Connection[] | null>(null);

  function reset() {
    setTab("layout");
    setPassword("");
    setVerified(false);
    setNewPassword("");
    setConfirmation("");
    setConfirmDelete(null);
    setConfirmAccount(false);
    setAccountPhrase("");
    setError("");
    setMessage("");
    setConnections(null);
  }
  async function loadConnections() {
    setConnections(null);
    try {
      const r = await fetch("/api/connections");
      const data = (await r.json()) as {
        connections?: Connection[];
        error?: string;
      };
      if (!r.ok || !data.connections)
        throw Error(data.error || "연결된 앱을 불러오지 못했습니다.");
      setConnections(data.connections);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "연결된 앱을 불러오지 못했습니다.",
      );
    }
  }
  async function disconnect(connection: Connection) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", id: connection.id }),
      });
      const data = (await r.json()) as { error?: string };
      // 이미 해제된 연결(404)도 목록에서 빼면 된다.
      if (!r.ok && r.status !== 404)
        throw Error(data.error || "처리하지 못했습니다.");
      setConnections(
        (list) => list?.filter((item) => item.id !== connection.id) ?? null,
      );
      setMessage(`${connection.name} 연결을 해제했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function request(body: object) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, password }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(data.error || "처리하지 못했습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (await request({ action: "verify" })) setVerified(true);
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (
      await request({ action: "change-password", newPassword, confirmation })
    ) {
      setPassword(newPassword);
      setNewPassword("");
      setConfirmation("");
      setMessage(
        "비밀번호가 변경되었습니다. 다른 기기는 로그아웃되고 연결된 앱은 해제됩니다.",
      );
    }
  }
  async function chooseLayout(next: LayoutId) {
    if (next === layout || layoutBusy) return;
    setLayoutBusy(true);
    setError("");
    setMessage("");
    const ok = await onLayoutChange(next);
    setLayoutBusy(false);
    if (ok) setMessage("화면이 변경되었습니다.");
    else setError("화면 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  async function deleteAll(kind: DeleteKind) {
    if (await request({ action: "delete-" + kind })) {
      onDeleted(kind);
      setMessage(`${deleteLabels[kind].button}가 완료되었습니다.`);
    }
  }
  async function deleteAccount() {
    if (
      await request({
        action: "delete-account",
        confirmation: accountPhrase,
      })
    ) {
      // 세션이 사라졌으므로 새로고침해 로그인 화면으로 돌아간다.
      window.location.reload();
      return;
    }
    setConfirmAccount(false);
    setAccountPhrase("");
  }

  return (
    <>
      <button
        type="button"
        className="settings-trigger"
        disabled={disabled}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Settings size={16} />
        설정
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setOpen(false);
            reset();
          }
        }}
      >
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>설정</DialogTitle>
            <DialogDescription>
              {tab === "layout"
                ? "작업공간 화면 배치를 고릅니다. 계정에 저장되어 모든 기기에 적용됩니다."
                : tab === "connections"
                  ? "업무 기록에 접근하도록 허용한 AI 앱입니다. 해제하면 그 앱은 더 이상 접근할 수 없습니다."
                  : verified
                  ? "계정 비밀번호를 변경하거나 기록을 일괄 삭제합니다."
                  : "계속하려면 현재 비밀번호를 입력해 주세요."}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setError("");
              setMessage("");
              if (value === "connections") void loadConnections();
            }}
            className="settings-tabs"
          >
            <TabsList>
              <TabsTrigger value="layout">화면</TabsTrigger>
              <TabsTrigger value="connections">연결된 앱</TabsTrigger>
              <TabsTrigger value="account">계정</TabsTrigger>
            </TabsList>
            <TabsContent value="layout">
              <div className="settings-theme">
                <h3>화면 테마</h3>
                <ThemeToggle />
              </div>
              <div className="layout-options" role="radiogroup" aria-label="화면 레이아웃">
                {LAYOUTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={layout === option.id}
                    className={layout === option.id ? "layout-option on" : "layout-option"}
                    disabled={layoutBusy}
                    onClick={() => void chooseLayout(option.id)}
                  >
                    <strong>{option.name}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="connections">
              {connections === null ? (
                !error && <p className="connections-empty">불러오는 중…</p>
              ) : connections.length === 0 ? (
                <p className="connections-empty">연결된 앱이 없습니다.</p>
              ) : (
                <ul className="connections">
                  {connections.map((connection) => (
                    <li key={connection.id}>
                      <div>
                        <strong>{connection.name}</strong>
                        {connection.host && <span>{connection.host}</span>}
                        <span>권한: {connection.scopes.join(", ")}</span>
                        <span>
                          연결 {dateTime.format(connection.created)} · 마지막
                          사용{" "}
                          {connection.lastUsed
                            ? dateTime.format(connection.lastUsed)
                            : "없음"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void disconnect(connection)}
                      >
                        연결 해제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="account">
              {!verified ? (
                <form className="settings-form" onSubmit={verify}>
                  <label className="dialog-label">
                    현재 비밀번호
                    <input
                      type="password"
                      autoFocus
                      autoComplete="current-password"
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || !password}
                  >
                    {busy ? "확인 중…" : "확인"}
                  </button>
                </form>
              ) : (
                <>
                  <form className="settings-form" onSubmit={changePassword}>
                    <h3>비밀번호 변경</h3>
                    <label className="dialog-label">
                      새 비밀번호
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </label>
                    <label className="dialog-label">
                      새 비밀번호 확인
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className="primary"
                      disabled={busy || !newPassword || !confirmation}
                    >
                      비밀번호 변경
                    </button>
                  </form>
                  <div className="settings-danger">
                    <h3>데이터 삭제</h3>
                    {(Object.keys(deleteLabels) as DeleteKind[]).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => setConfirmDelete(kind)}
                      >
                        {deleteLabels[kind].button}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => setConfirmAccount(true)}
                    >
                      계정 삭제
                    </button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
          <p role="status" className="saved">
            {message}
          </p>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(value) => {
          if (!value) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirmDelete && deleteLabels[confirmDelete].button}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDelete && deleteLabels[confirmDelete].target} 영구
            삭제되며 되돌릴 수 없습니다.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) void deleteAll(confirmDelete);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmAccount}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setConfirmAccount(false);
            setAccountPhrase("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>계정 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            계정과 모든 업무일지·메모·일일메모가 영구 삭제되며 되돌릴 수
            없습니다. 계속하려면 아래에 &lsquo;{DELETE_ACCOUNT_PHRASE}&rsquo;를
            입력해 주세요.
          </AlertDialogDescription>
          <label className="dialog-label">
            확인 문구
            <input
              autoFocus
              autoComplete="off"
              maxLength={20}
              placeholder={DELETE_ACCOUNT_PHRASE}
              value={accountPhrase}
              onChange={(e) => setAccountPhrase(e.target.value)}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || accountPhrase !== DELETE_ACCOUNT_PHRASE}
              onClick={(e) => {
                e.preventDefault();
                void deleteAccount();
              }}
            >
              {busy ? "삭제 중…" : "계정 영구 삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
