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
// /users/:id/reset-password), nunca mais recuperável — só o hash bcrypt fica guardado. A caixa de
// confirmação (`acked`) é um endurecimento deliberado além do protótipo confirmado — mesmo padrão
// já usado em GeneratedKeyModal pro mesmo tipo de segredo revelado uma única vez.
//
// Fase 6 (fidelity pass): título/sub/labels/botões tinham ficado em português por engano num
// decode anterior — get_full_jsx("TempPasswordModal") confirma o texto real (inglês); a caixa de
// ack (que não existe no protótipo) foi só traduzida, pro mesmo tom de GeneratedKeyModal.
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
      title={reset ? "Temporary password reset" : "User created"}
      sub={`Hand this password to ${username}`}
      onClose={onClose}
      closeable={acked}
      footer={
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!acked} onClick={onClose}>
          <Icon name="check" size={16} /> Got it, I saved it
        </button>
      }
    >
      <div className="temp-pw-box">
        <div className="temp-pw-label">Temporary password</div>
        <div className="temp-pw-value mono">{password}</div>
        <button className={"btn btn-soft btn-sm" + (copied ? " skey-copied" : "")} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="notice">
        <Icon name="warn" size={16} />
        <span>
          On first login, <b>{username}</b> must change this password before using the system.
        </span>
      </div>

      <label className="skey-ack" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
        <span>I&apos;ve copied this password and will hand it over securely</span>
      </label>

      {!acked && (
        <div className="field-hint" style={{ textAlign: "center", fontSize: 12 }}>
          Check the box above to enable closing this dialog.
        </div>
      )}
    </Modal>
  );
}
