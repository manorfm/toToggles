import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface TempPasswordModalProps {
  username: string;
  password: string;
  reset?: boolean;
  onClose: () => void;
}

// Adaptado do TempPasswordModal real do protótipo (decodificado do bundle comprimido embutido
// em docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método). Mesmo contrato de
// reveal-once de GeneratedKeyModal: a senha só existe nesta resposta (POST /users ou POST
// /users/:id/reset-password), nunca mais recuperável — só o hash bcrypt fica guardado.
export function TempPasswordModal({ username, password, reset = false, onClose }: TempPasswordModalProps) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <Modal
      icon="lock"
      title={reset ? "Senha provisória redefinida" : "Usuário criado"}
      sub={`Entregue esta senha para ${username}`}
      onClose={onClose}
      closeable={acked}
      footer={
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!acked} onClick={onClose}>
          <Icon name="check" size={16} /> Entendi, já anotei
        </button>
      }
    >
      <div className="temp-pw-box">
        <div className="temp-pw-label">Senha provisória</div>
        <div className="temp-pw-value mono">{password}</div>
        <button className={"btn btn-soft btn-sm" + (copied ? " skey-copied" : "")} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className="notice">
        <Icon name="warn" size={16} />
        <span>
          No primeiro acesso, <b>{username}</b> será obrigado a trocar esta senha antes de usar o sistema.
        </span>
      </div>

      <label className="skey-ack" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
        <span>Copiei e vou entregar essa senha com segurança</span>
      </label>

      {!acked && (
        <div className="field-hint" style={{ textAlign: "center", fontSize: 12 }}>
          Marque a caixa acima pra poder fechar este modal.
        </div>
      )}
    </Modal>
  );
}
