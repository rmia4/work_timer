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

export type DeleteKind = "tasks" | "memos" | "daily-memos";
const deleteLabels: Record<DeleteKind, { button: string; target: string }> = {
  tasks: { button: "업무일지 전체 삭제", target: "모든 업무일지 기록과 측정 시간이" },
  memos: { button: "전체 메모 삭제", target: "모든 메모가" },
  "daily-memos": { button: "전체 일일메모 삭제", target: "모든 날짜의 일일메모가" },
};

export default function SettingsDialog({
  disabled,
  onDeleted,
}: {
  disabled?: boolean;
  onDeleted: (kind: DeleteKind) => void;
}) {
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [verified, setVerified] = useState(false),
    [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [confirmDelete, setConfirmDelete] = useState<DeleteKind | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");

  function reset() {
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
              {verified
                ? "계정 비밀번호를 변경하거나 기록을 일괄 삭제합니다."
                : "계속하려면 현재 비밀번호를 입력해 주세요."}
            </DialogDescription>
          </DialogHeader>
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
