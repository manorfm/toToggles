import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ToastEntry {
  id: string;
  message: string;
}

type Notify = (message: string) => void;

const ToastContext = createContext<Notify | null>(null);

// Igual ao protótipo real (app.jsx#toast, decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver server/CLAUDE.md): 2.6s de vida, sem botão de fechar.
const TOAST_DURATION_MS = 2600;

// Feedback transitório global — sistema de toasts inexistente até agora (achado numa revisão
// contra o protótipo: toda mutação bem-sucedida lá dispara `toast(msg)`, aqui não havia
// nenhum sinal equivalente, então criar/apagar/alterar algo confirmava só silenciosamente).
// Cobre apenas o caminho de sucesso (e "enviado para aprovação", que no protótipo usa o
// mesmo toast) — erros continuam nos banners inline já existentes por tela, que carregam mais
// contexto do que os 2.6s de um toast permitem ler.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const notify = useCallback<Notify>((message) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <Icon name="check" size={15} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// useToast()(message) mostra um toast a partir de qualquer componente dentro de
// <ToastProvider> — ver o comentário do provider acima pra convenção de quando chamar.
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return notify;
}
