import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastEntry {
  id: string;
  message: string;
  action?: ToastAction;
}

type Notify = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Notify | null>(null);

// Igual ao protótipo real (app.jsx#toast, decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver server/CLAUDE.md): `setTimeout(..., action ? 8000 : 3200)` — sem
// botão de fechar, mas um toast com Undo (v2.6 §4.2/4.3) fica no ar bem mais tempo pra dar
// chance real de reverter antes de sumir.
const TOAST_DURATION_MS = 3200;
const TOAST_DURATION_WITH_ACTION_MS = 8000;

// Feedback transitório global — sistema de toasts inexistente até agora (achado numa revisão
// contra o protótipo: toda mutação bem-sucedida lá dispara `toast(msg)`, aqui não havia
// nenhum sinal equivalente, então criar/apagar/alterar algo confirmava só silenciosamente).
// Cobre apenas o caminho de sucesso (e "enviado para aprovação", que no protótipo usa o
// mesmo toast) — erros continuam nos banners inline já existentes por tela, que carregam mais
// contexto do que um toast permite ler.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, action) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, action }]);
      setTimeout(() => dismiss(id), action ? TOAST_DURATION_WITH_ACTION_MS : TOAST_DURATION_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <Icon name="check" size={15} />
            {t.message}
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// useToast()(message, action?) mostra um toast a partir de qualquer componente dentro de
// <ToastProvider> — ver o comentário do provider acima pra convenção de quando chamar.
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return notify;
}
