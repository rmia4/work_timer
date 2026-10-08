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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");

  function reset() {
    setTab("layout");
    setPassword("");
    setVerified(false);
    setNewPassword("");
    setConfirmation("");
    setConfirmDelete(null);
    setError("");
    setMessage("");
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
      setMessage("비밀번호가 변경되었습니다. 다른 기기는 로그아웃됩니다.");
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
            }}
            className="settings-tabs"
          >
            <TabsList>
              <TabsTrigger value="layout">화면</TabsTrigger>
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
    </>
  );
}
