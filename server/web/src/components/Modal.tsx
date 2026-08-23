import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface ModalProps {
  icon: IconName;
  title: string;
  sub?: string;
  onClose: () => void;
  closeable?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

// Chrome genérico de modal, adaptado de get_full_jsx("Modal") — reaproveitado por
// qualquer fluxo de criação/edição (times, aplicações, ...) em vez de cada um
// desenhar sua própria casca.
export function Modal({ icon, title, sub, onClose, closeable = true, footer, children }: ModalProps) {
  return (
    <div
      className="modal-scrim"
      data-testid="modal-scrim"
      onClick={(e) => {
        if (closeable && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div className="modal-glyph">
            <Icon name={icon} size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button
            className="icon-btn modal-x"
            aria-label="Close"
            onClick={closeable ? onClose : undefined}
            disabled={!closeable}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
