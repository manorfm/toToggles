import type { ReactNode } from "react";
import { Modal } from "./Modal";
import type { IconName } from "./Icon";

interface ConfirmModalProps {
  title: string;
  sub?: string;
  body?: ReactNode;
  icon?: IconName;
  danger?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}

// Adaptado de get_component_spec("ConfirmModal") — casca genérica de confirmação
// (usada por deletar time/aplicação/toggle) sobre o já existente components/Modal.tsx.
export function ConfirmModal({ title, sub, body, icon, danger, confirmLabel, onClose, onConfirm }: ConfirmModalProps) {
  return (
    <Modal
      icon={icon ?? (danger ? "trash" : "warn")}
      title={title}
      sub={sub}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className={"btn " + (danger ? "btn-danger-fill" : "btn-primary")} onClick={onConfirm}>
            {confirmLabel ?? "Confirm"}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
