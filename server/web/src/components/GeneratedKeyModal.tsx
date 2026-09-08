import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface GeneratedKeyModalProps {
  plainKey: string;
  onClose: () => void;
  // true quando a chave veio de uma solicitação sob aprovação (generate-secret 202) — o registro
  // já existe (inativo) e este é o único momento em que alguém vai ver o valor em texto puro, mas
  // ele ainda não autentica nada até um aprovador aprovar a solicitação (server/CLAUDE.md).
  pendingApproval?: boolean;
  // true quando já existia uma chave (current ou previous) antes desta geração — confirmado no
  // protótipo real (get_full_jsx("ServiceKeyModal")): título vira "New service key generated".
  // SecretKeySection.tsx já calculava exatamente essa condição pra decidir se mostra confirmação
  // antes de gerar — só nunca repassava pra este modal (achado numa varredura posterior).
  //
  // Divergência deliberada: o confirmado também tem um aviso "The previous key was revoked" nessa
  // variante — omitido aqui de propósito, porque seria FALSO no nosso modelo. O protótipo sempre
  // substitui a chave na hora (sem overlap); esta reescrita tem uma janela de overlap real (v2.6
  // §5.1) onde a chave anterior CONTINUA válida até ser revogada explicitamente — dizer "foi
  // revogada" aqui contradiria o aviso correto que SecretKeySection.tsx já mostra logo em seguida
  // ("The previous key is still valid during the rotation overlap window...").
  rotated?: boolean;
  // Nome da aplicação, só pra exibição na subtítulo — confirmado no protótipo real
  // (`${appName} · shown once...`); omitido em qualquer chamador que não tenha esse dado à mão.
  appName?: string;
}

// Adaptado de get_full_jsx("ServiceKeyModal") — a chave só existe nesta resposta
// (docs/rest-flow.md §8: "plain_key is never persisted or retrievable again"), então
// o modal só pode ser fechado depois que o usuário confirmar que já a salvou.
export function GeneratedKeyModal({ plainKey, onClose, pendingApproval, rotated, appName }: GeneratedKeyModalProps) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(plainKey);
    setCopied(true);
  }

  const title = pendingApproval
    ? "Service key generated — pending approval"
    : rotated
      ? "New service key generated"
      : "Service key generated";

  return (
    <Modal
      icon="key"
      title={title}
      sub={appName ? `${appName} · shown once — save it now before closing` : "Shown once — save it now before closing"}
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
          {pendingApproval && (
            <>
              {" "}
              It will not work yet — an approver still needs to approve this request before the key becomes valid.
            </>
          )}
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
