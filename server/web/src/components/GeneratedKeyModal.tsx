import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface GeneratedKeyModalProps {
  plainKey: string;
  onClose: () => void;
}

// Adaptado de get_full_jsx("ServiceKeyModal") — a chave só existe nesta resposta
// (docs/rest-flow.md §8: "plain_key is never persisted or retrievable again"), então
// o modal só pode ser fechado depois que o usuário confirmar que já a salvou.
export function GeneratedKeyModal({ plainKey, onClose }: GeneratedKeyModalProps) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(plainKey);
    setCopied(true);
  }

  return (
    <Modal
      icon="key"
      title="Service key generated"
      sub="Shown once — save it now before closing"
      onClose={onClose}
      closeable={acked}
      footer={
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!acked} onClick={onClose}>
          <Icon name="check" size={16} /> Done, I&apos;ve saved the key
        </button>
      }
    >
      <div className="skey-warn">
        <Icon name="warn" size={16} />
        <div>
          <b>Save this key immediately.</b> Once you close this dialog the key is permanently masked.
          There is no way to retrieve it from toToggle — store it in a secrets manager.
        </div>
      </div>

      <div className="skey-box">
        <code className="skey-val">{plainKey}</code>
        <button className={"btn btn-soft btn-sm" + (copied ? " skey-copied" : "")} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied!" : "Copy key"}
        </button>
      </div>

      <label className="skey-ack">
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
        <span>I&apos;ve copied this key and stored it securely</span>
      </label>

      {!acked && (
        <div className="field-hint" style={{ textAlign: "center", fontSize: 12 }}>
          Check the box above to enable closing this dialog.
        </div>
      )}
    </Modal>
  );
}
