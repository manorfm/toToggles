import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface GeneratedPasswordModalProps {
  username: string;
  password: string;
  onClose: () => void;
}

// Mesmo padrão de reveal-once de GeneratedKeyModal (docs/rest-flow.md §3: a senha só
// existe na resposta de POST /users, nunca mais recuperável) — sem tela de origem no
// protótipo (User Management não existe lá), reaproveita a estrutura já confirmada.
export function GeneratedPasswordModal({ username, password, onClose }: GeneratedPasswordModalProps) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <Modal
      icon="user"
      title="User created"
      sub="Their password is shown once — save it now before closing"
      onClose={onClose}
      closeable={acked}
      footer={
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!acked} onClick={onClose}>
          <Icon name="check" size={16} /> Done, I&apos;ve saved the password
        </button>
      }
    >
      <div className="skey-warn">
        <Icon name="warn" size={16} />
        <div>
          <b>Save this password immediately.</b> Once you close this dialog it is permanently masked. There is
          no way to retrieve it from toToggle — share it with {username} through a secure channel.
        </div>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label className="field-label">Username</label>
        <div className="mono">{username}</div>
      </div>

      <div className="skey-box">
        <code className="skey-val">{password}</code>
        <button className={"btn btn-soft btn-sm" + (copied ? " skey-copied" : "")} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied!" : "Copy password"}
        </button>
      </div>

      <label className="skey-ack">
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
        <span>I&apos;ve copied this password and shared it securely</span>
      </label>

      {!acked && (
        <div className="field-hint" style={{ textAlign: "center", fontSize: 12 }}>
          Check the box above to enable closing this dialog.
        </div>
      )}
    </Modal>
  );
}
