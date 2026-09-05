import { useState } from "react";
import { createApplication } from "../api/applications";
import { ApiError } from "../api/client";
import { generateSecretKey } from "../api/secretKeys";
import { createTeam } from "../api/teams";
import { createToggle } from "../api/toggles";
import { createUser } from "../api/users";
import { findByNameCaseInsensitive, markOnboarded, suggestUsername } from "../lib/onboarding";
import { Icon } from "./Icon";
import {
  AppStep,
  IntegrateStep,
  KeyStep,
  ObProgress,
  PeopleStep,
  TeamStep,
  ToggleStep,
  WelcomeStep,
  type OnboardingMemberCreds,
} from "./OnboardingSteps";

interface NamedRecord {
  id: string;
  name: string;
}

interface OnboardingModalProps {
  existingTeams: NamedRecord[];
  existingApps: NamedRecord[];
  existingUsernames: string[];
  onClose: () => void;
}

interface CreatedFlags {
  team: boolean;
  member: boolean;
  app: boolean;
  toggle: boolean;
}

// v2.6 §6.7-6.9 — guided first-run setup wizard. Diferente do protótipo confirmado
// (get_component_full("OnboardingModal") via design-graph), que recebe onCreateTeam/onAddMember/
// onCreateApp/onCreateToggle/onGenerateKey como callbacks de um App-monolito em memória, este
// componente chama a API real diretamente — mesmo padrão de todo outro modal de criação já
// existente neste app (CreateToggleModal, CreateApplicationModal etc.), que também são donos da
// própria chamada em vez de delegar pro pai. `existingTeams`/`existingApps`/`existingUsernames`
// vêm de AppShell (que já os carrega pros badges/command palette) — evita um fetch duplicado só
// pra dedupe-by-name.
//
// Só root pode de fato completar este wizard: criar um team é `RequireRoot()` no backend (nem
// approval-aware — sempre síncrono), e root ignora o workflow de aprovação em qualquer outro
// passo (gerar app/toggle/chave nunca fica pendente pra root). AppShell só oferece esta tela pra
// role root — ver o comentário lá.
export function OnboardingModal({ existingTeams, existingApps, existingUsernames, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [teamName, setTeamName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<"Admin" | "User">("User");
  const [appName, setAppName] = useState("");
  const [togglePath, setTogglePath] = useState("");

  const [teamId, setTeamId] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [memberCreds, setMemberCreds] = useState<OnboardingMemberCreds | null>(null);
  const [codeTab, setCodeTab] = useState(0);
  const [created, setCreated] = useState<CreatedFlags>({ team: false, member: false, app: false, toggle: false });

  const [submitting, setSubmitting] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function skip() {
    markOnboarded();
    onClose();
  }

  function canAdvance(): boolean {
    if (step === 1) return teamName.trim().length > 0;
    if (step === 2) return memberName.trim().length > 0;
    if (step === 3) return appName.trim().length > 0;
    if (step === 4) return togglePath.split(".").map((s) => s.trim()).filter(Boolean).length > 0;
    return true;
  }

  async function next() {
    if (!canAdvance() || submitting) return;
    setError(null);

    if (step === 6) {
      markOnboarded();
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      if (step === 1 && !created.team) {
        const trimmed = teamName.trim();
        const existing = findByNameCaseInsensitive(existingTeams, trimmed);
        const id = existing ? existing.id : (await createTeam({ name: trimmed })).id;
        setTeamId(id);
        setCreated((c) => ({ ...c, team: true }));
      } else if (step === 2 && !created.member && teamId) {
        const trimmedName = memberName.trim();
        const username = suggestUsername(trimmedName, existingUsernames);
        const result = await createUser({
          name: trimmedName,
          username,
          role: memberRole === "Admin" ? "admin" : "user",
          teamId,
          isApprover: false,
        });
        setMemberCreds({ username: result.user.username, tempPassword: result.password });
        setCreated((c) => ({ ...c, member: true }));
      } else if (step === 3 && !created.app) {
        const trimmed = appName.trim();
        const existing = findByNameCaseInsensitive(existingApps, trimmed);
        if (existing) {
          setAppId(existing.id);
        } else {
          const result = await createApplication({ name: trimmed, teamId: teamId! });
          if (result.kind === "pending_approval") {
            throw new Error("Application creation is pending approval — unexpected for a root-only wizard.");
          }
          setAppId(result.application.id);
        }
        setCreated((c) => ({ ...c, app: true }));
      } else if (step === 4 && !created.toggle && appId) {
        const path = togglePath
          .split(".")
          .map((s) => s.trim())
          .filter(Boolean)
          .join(".");
        const result = await createToggle(appId, path);
        if (result.kind === "pending_approval") {
          throw new Error("Toggle creation is pending approval — unexpected for a root-only wizard.");
        }
        setCreated((c) => ({ ...c, toggle: true }));
      }
      setStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateKey() {
    if (!appId || generatingKey) return;
    setError(null);
    setGeneratingKey(true);
    try {
      const result = await generateSecretKey(appId);
      if (result.kind === "pending_approval") {
        throw new Error("Secret key creation is pending approval — unexpected for a root-only wizard.");
      }
      setKeyValue(result.plainKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the key. Please try again.");
    } finally {
      setGeneratingKey(false);
    }
  }

  function copyKey() {
    if (!keyValue) return;
    try {
      navigator.clipboard.writeText(keyValue);
    } catch {
      // Sem clipboard (contexto não-seguro, permissão negada) — a chave já está visível na
      // tela pra copiar manualmente, então falhar aqui não é bloqueante.
    }
    setKeyCopied(true);
  }

  const isWide = step === 0 || step === 6;
  const keyAckPending = step === 5 && !!keyValue && !keySaved;

  return (
    <div className="ob-scrim">
      <div className={"ob-modal" + (isWide ? " wide" : "")}>
        <div className="ob-head">
          <div className="ob-head-brand">
            <div className="ob-head-mark">
              <Icon name="toggle" size={15} />
            </div>
            to<b>Toggle</b>
          </div>
          {step > 0 && step < 6 && <ObProgress step={step} />}
          {step === 6 && (
            <div className="ob-done-pill">
              <Icon name="check" size={13} /> Setup complete
            </div>
          )}
        </div>

        <div className="ob-content">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <TeamStep teamName={teamName} setTeamName={setTeamName} />}
          {step === 2 && (
            <PeopleStep
              teamName={teamName}
              memberName={memberName}
              setMemberName={setMemberName}
              memberRole={memberRole}
              setMemberRole={setMemberRole}
            />
          )}
          {step === 3 && <AppStep teamName={teamName} appName={appName} setAppName={setAppName} />}
          {step === 4 && <ToggleStep appName={appName} togglePath={togglePath} setTogglePath={setTogglePath} />}
          {step === 5 && (
            <KeyStep
              appName={appName}
              keyValue={keyValue}
              keyCopied={keyCopied}
              keySaved={keySaved}
              setKeySaved={setKeySaved}
              onGenerate={handleGenerateKey}
              onCopy={copyKey}
              generating={generatingKey}
            />
          )}
          {step === 6 && (
            <IntegrateStep
              appName={appName}
              togglePath={togglePath}
              teamName={teamName}
              memberName={memberName}
              memberCreds={memberCreds}
              keyValue={keyValue}
              codeTab={codeTab}
              setCodeTab={setCodeTab}
            />
          )}
        </div>

        {error && (
          <div className="field-hint danger" style={{ padding: "0 22px 14px" }}>
            {error}
          </div>
        )}

        <div className="ob-foot">
          {step === 0 ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={skip}>
                Skip tour
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-primary" onClick={next}>
                Start setup <Icon name="chevron-down" size={16} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </>
          ) : step === 6 ? (
            <>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-primary" onClick={next}>
                <Icon name="check" size={16} /> Open toToggle
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setStep((s) => s - 1)}>
                <Icon name="back" size={15} /> Back
              </button>
              <div style={{ flex: 1 }} />
              {step === 5 && !keyValue && <span className="ob-foot-hint">You can generate it later from the app's Service key tab</span>}
              {step === 5 && keyAckPending && <span className="ob-foot-hint">Confirm you stored the key</span>}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canAdvance() || submitting || keyAckPending}
                onClick={next}
              >
                {submitting ? "Please wait…" : "Next"} <Icon name="chevron-down" size={16} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
