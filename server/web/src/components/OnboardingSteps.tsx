import { Icon, type IconName } from "./Icon";
import { OnboardingCodeBlock } from "./OnboardingCodeBlock";

// v2.6 §6.7-6.9 — telas do onboarding wizard, confirmadas via design-graph
// (get_component_full("OnboardingModal")): WelcomeStep, TeamStep, PeopleStep(+ObRoleCard),
// AppStep, ToggleStep(+CascadeDemo), KeyStep, IntegrateStep, ObProgress, ObLeft. Mantidos juntos
// neste único arquivo — são 10 componentes pequenos, cada um usado uma única vez, só por
// OnboardingModal.tsx; dividir em 10 arquivos não ajudaria a legibilidade.
//
// Duas substituições deliberadas por falta de dado confirmado (design-graph não indexa o path
// SVG bruto do ícone "code" nem de "chevright" — só o wrapper genérico do componente Icon, sem
// os dados de cada glifo): o card "Integration" do Welcome reusa o ícone já existente "settings"
// em vez de inventar um path novo; toda seta "→" reusa "chevron-down" rotacionado -90°.

// ---- Progress dots ----
const PROGRESS_LABELS = ["Teams", "People", "Application", "Toggles", "Service Key", "Integration"];

export function ObProgress({ step }: { step: number }) {
  const pct = Math.round(((step - 1) / 5) * 100);
  return (
    <div className="ob-prog">
      <div className="ob-prog-bar">
        <div className="ob-prog-fill" style={{ width: pct + "%" }} />
      </div>
      <div className="ob-prog-steps">
        {PROGRESS_LABELS.map((lbl, i) => {
          const n = i + 1;
          const st = n < step ? "done" : n === step ? "active" : "idle";
          return (
            <div key={lbl} className={"ops " + st}>
              <div className="ops-dot">{st === "done" ? <Icon name="check" size={10} /> : n}</div>
              <div className="ops-lbl">{lbl}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Left story panel ----
interface ObLeftProps {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}

export function ObLeft({ icon, title, children }: ObLeftProps) {
  return (
    <div className="ob-left">
      <div className="obl-icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="obl-title">{title}</div>
      <div className="obl-body">{children}</div>
    </div>
  );
}

// ---- Step 0 — Welcome ----
const WELCOME_CARDS: { icon: IconName; n: number; label: string; desc: string }[] = [
  { icon: "users", n: 1, label: "Teams", desc: "Groups responsible for applications" },
  { icon: "user", n: 2, label: "People", desc: "Members with Admin / User roles" },
  { icon: "apps", n: 3, label: "Application", desc: "Groups every toggle of a service" },
  { icon: "layers", n: 4, label: "Toggles", desc: "Dotted-path flags with automatic cascading" },
  { icon: "key", n: 5, label: "Service Key", desc: "Secret key shown exactly once" },
  { icon: "settings", n: 6, label: "Integration", desc: "Kotlin/Java lib — 3 lines to connect" },
];

export function WelcomeStep() {
  return (
    <div className="ob-welcome">
      <div className="ob-welcome-hero">
        <div className="ob-big-mark">
          <Icon name="toggle" size={32} />
        </div>
        <div className="ob-welcome-title">Set up toToggle in 6 steps</div>
        <div className="ob-welcome-sub">
          An interactive guide to create your first team, add members, set up an Application, create toggles,
          generate the service key and integrate the lib into your code.
        </div>
      </div>
      <div className="ob-step-grid">
        {WELCOME_CARDS.map((c) => (
          <div key={c.n} className="ob-sc">
            <div className="ob-sc-num">{c.n}</div>
            <div className="ob-sc-icon">
              <Icon name={c.icon} size={18} />
            </div>
            <div className="ob-sc-label">{c.label}</div>
            <div className="ob-sc-desc">{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Step 1 — Team ----
interface TeamStepProps {
  teamName: string;
  setTeamName: (value: string) => void;
}

export function TeamStep({ teamName, setTeamName }: TeamStepProps) {
  return (
    <div className="ob-split">
      <ObLeft icon="users" title="Teams">
        <p>Teams group people who share responsibility over applications. Everything in toToggle starts with a team.</p>
        <p>
          Create teams by domain or area — e.g. <b>Payments</b>, <b>Growth</b>, <b>Platform</b>.
        </p>
        <div className="ob-callout">
          <Icon name="warn" size={14} />
          <span>Only members of the owning team can create, edit or delete the toggles of an Application.</span>
        </div>
      </ObLeft>
      <div className="ob-right">
        <div className="ob-form-title">Create your first team</div>
        <div className="field">
          <label className="field-label" htmlFor="ob-team-name">
            Team name
          </label>
          <input
            id="ob-team-name"
            className="input"
            placeholder="e.g. Payments, Growth, Platform"
            value={teamName}
            autoFocus
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="field-hint">You can rename it and create more teams later.</div>
        </div>
      </div>
    </div>
  );
}

// ---- Step 2 — People ----
const ROLE_CARDS = [
  {
    name: "Admin",
    cls: "admin",
    items: [
      "Creates and deletes Applications",
      "Generates and revokes service keys",
      "Manages team members",
      "Creates and configures toggles",
      "Approves sensitive requests",
    ],
  },
  {
    name: "User",
    cls: "editor",
    items: ["Read-only access", "Can suggest changes for an approver to review", "Ideal for stakeholders and auditors"],
  },
];

export function ObRoleCard({ name, cls, items }: { name: string; cls: string; items: string[] }) {
  return (
    <div className={"ob-role " + cls}>
      <div className="or-name">{name}</div>
      <ul className="or-list">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

interface PeopleStepProps {
  teamName: string;
  memberName: string;
  setMemberName: (value: string) => void;
  memberRole: "Admin" | "User";
  setMemberRole: (value: "Admin" | "User") => void;
}

export function PeopleStep({ teamName, memberName, setMemberName, memberRole, setMemberRole }: PeopleStepProps) {
  return (
    <div className="ob-split">
      <ObLeft icon="user" title="Access roles">
        <p>Each member has a role that defines exactly what they can do in toToggle.</p>
        <div className="ob-roles">
          {ROLE_CARDS.map((r) => (
            <ObRoleCard key={r.name} {...r} />
          ))}
        </div>
      </ObLeft>
      <div className="ob-right">
        <div className="ob-form-title">
          Add someone to <b>{teamName}</b>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ob-member-name">
            Full name
          </label>
          <input
            id="ob-member-name"
            className="input"
            placeholder="e.g. Ana Ribeiro"
            value={memberName}
            autoFocus
            onChange={(e) => setMemberName(e.target.value)}
          />
          <div className="field-hint">
            This creates a real login account with a temporary password — shown once, at the end of this wizard.
          </div>
        </div>
        <div className="field">
          <label className="field-label">Role</label>
          <div className="ob-role-pick">
            {(["Admin", "User"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={"ob-role-btn" + (memberRole === r ? " sel" : "")}
                onClick={() => setMemberRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="field-hint">
            {memberRole === "Admin" && "Full access — use for accountable tech leads."}
            {memberRole === "User" && "Read-only — ideal for PMs, QA and stakeholders."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Step 3 — Application ----
interface AppStepProps {
  teamName: string;
  appName: string;
  setAppName: (value: string) => void;
}

export function AppStep({ teamName, appName, setAppName }: AppStepProps) {
  return (
    <div className="ob-split">
      <ObLeft icon="apps" title="Application">
        <p>
          An Application represents a service or product — e.g. <b>Checkout Service</b>, <b>Mobile App</b>,{" "}
          <b>Admin Console</b>.
        </p>
        <p>
          It groups every toggle of that service and has its own <b>service key</b>, which your code uses to fetch
          the toggles through the API.
        </p>
        <div className="ob-callout">
          <Icon name="layers" size={14} />
          <span>
            The <b>{teamName}</b> team will own this Application and all of its toggles.
          </span>
        </div>
      </ObLeft>
      <div className="ob-right">
        <div className="ob-form-title">Create your first Application</div>
        <div className="field">
          <label className="field-label" htmlFor="ob-app-name">
            Application name
          </label>
          <input
            id="ob-app-name"
            className="input"
            placeholder="e.g. Checkout Service, Mobile App"
            value={appName}
            autoFocus
            onChange={(e) => setAppName(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ---- Step 4 — Toggles ----
export function CascadeDemo({ parts }: { parts: string[] }) {
  const demo = parts.length > 1 ? parts : ["service", "feature", "flag"];
  const isExample = parts.length <= 1;
  return (
    <div className="ob-cascade">
      {isExample && <div className="ob-cascade-lbl">cascading example</div>}
      {demo.map((seg, i) => (
        <div key={i} className="obc-row" style={{ paddingLeft: i * 16 }}>
          <div className={"obc-dot " + (i === 0 ? "off" : "on")} />
          <code className="obc-seg">{seg}</code>
          <span className={"obc-badge " + (i === 0 ? "off" : "on")}>{i === 0 ? "off" : "on"}</span>
          {i > 0 && <span className="obc-note">↳ inactive</span>}
        </div>
      ))}
      <div className="obc-footer">
        Even when on, children stay inactive while the parent is <b>off</b>.
      </div>
    </div>
  );
}

interface ToggleStepProps {
  appName: string;
  togglePath: string;
  setTogglePath: (value: string) => void;
}

export function ToggleStep({ appName, togglePath, setTogglePath }: ToggleStepProps) {
  const parts = togglePath
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="ob-split">
      <ObLeft icon="layers" title="Toggles">
        <p>
          Toggles are switches for features. They use <b>dotted paths</b>, where each segment is an independent
          toggle.
        </p>
        <p>
          A parent controls its children automatically — that is <b>cascading</b>. Turn a parent node off to
          deactivate a whole subtree at once.
        </p>
        <CascadeDemo parts={parts} />
      </ObLeft>
      <div className="ob-right">
        <div className="ob-form-title">
          Create the first toggle in <b>{appName}</b>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ob-toggle-path">
            Toggle path
          </label>
          <input
            id="ob-toggle-path"
            className="input mono"
            placeholder="e.g. payments.card.installments"
            value={togglePath}
            autoFocus
            onChange={(e) => setTogglePath(e.target.value)}
          />
          <div className="field-hint">
            Each segment separated by <code>.</code> creates a parent→child toggle. Missing segments are created
            automatically.
          </div>
        </div>
        {parts.length > 0 && (
          <div className="ob-path-preview">
            {parts.map((p, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: "var(--ink-4)", padding: "0 2px" }}>.</span>}
                {p}
              </span>
            ))}
            <span className="ob-parts-count">
              {parts.length} toggle{parts.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Step 5 — Service Key ----
interface KeyStepProps {
  appName: string;
  keyValue: string | null;
  keyCopied: boolean;
  keySaved: boolean;
  setKeySaved: (value: boolean) => void;
  onGenerate: () => void;
  onCopy: () => void;
  generating: boolean;
}

export function KeyStep({ appName, keyValue, keyCopied, keySaved, setKeySaved, onGenerate, onCopy, generating }: KeyStepProps) {
  return (
    <div className="ob-split">
      <ObLeft icon="key" title="Service Key">
        <p>
          The service key authenticates your service with toToggle to fetch toggles through the API. It is sent in
          the <code>X-API-Key</code> header.
        </p>
        <div className="ob-callout warn">
          <Icon name="warn" size={14} />
          <span>
            <b>Shown only once.</b> It cannot be retrieved later. Store it immediately in a secrets manager (AWS
            Secrets Manager, HashiCorp Vault, Doppler…).
          </span>
        </div>
        <ul className="ob-list">
          <li>1 key per Application</li>
          <li>To rotate: generate a new one, update your services, and only then revoke the previous key</li>
          <li>Never commit the key to your repository</li>
        </ul>
      </ObLeft>
      <div className="ob-right">
        <div className="ob-form-title">
          Generate the key for <b>{appName}</b>
        </div>
        {!keyValue ? (
          <div className="ob-key-empty">
            <div className="oke-icon">
              <Icon name="key" size={28} />
            </div>
            <div className="oke-text">No key generated yet</div>
            <button type="button" className="btn btn-primary" onClick={onGenerate} disabled={generating}>
              <Icon name="plus" size={16} /> {generating ? "Generating…" : "Generate service key"}
            </button>
          </div>
        ) : (
          <>
            <div className="ob-key-reveal">
              <div className="okr-label">
                <Icon name="key" size={13} /> Your service key — copy it now
              </div>
              <code className="okr-val">{keyValue}</code>
              <button type="button" className={"btn btn-soft btn-sm" + (keyCopied ? " skey-copied" : "")} onClick={onCopy}>
                <Icon name={keyCopied ? "check" : "copy"} size={14} />
                {keyCopied ? "Copied!" : "Copy key"}
              </button>
            </div>
            <label className="skey-ack" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={keySaved} onChange={(e) => setKeySaved(e.target.checked)} />
              <span>I stored the key somewhere safe</span>
            </label>
            {!keySaved && <div className="field-hint" style={{ textAlign: "center" }}>Confirm the key is stored to continue.</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Step 6 — Integration ----
export interface OnboardingMemberCreds {
  username: string;
  tempPassword: string;
}

interface IntegrateStepProps {
  appName: string;
  togglePath: string;
  teamName: string;
  memberName: string;
  memberCreds: OnboardingMemberCreds | null;
  keyValue: string | null;
  codeTab: number;
  setCodeTab: (value: number) => void;
}

// Amostras de código reais (não fictícias): API confirmada 1:1 contra totoggle_java/src/main/
// kotlin/com/totoggle/client/config/ToToggleConfig.kt (`builder()`, `applicationName`,
// `serverUrl`, `secretKey`, `refreshInterval`, `enableOfflineMode`) e ToToggleClient.kt
// (`start()`, `isActive(path)`, `isActive(path, param)`, `shutdown()`) — não uma cópia cega do
// protótipo, embora o texto tenha acabado sendo idêntico ao já confirmado ali.
function integrationCodes(appName: string, togglePath: string): [string, string, string] {
  const nm = appName || "my-app";
  const tp = togglePath || "feature.my-flag";
  return [
    `// build.gradle.kts
dependencies {
    implementation("com.totoggle:totoggle-java:1.0.0")
}`,
    `import com.totoggle.client.ToToggleClient
import com.totoggle.client.config.ToToggleConfig
import java.time.Duration

val config = ToToggleConfig.builder()
    .applicationName("${nm}")
    .serverUrl("https://your-server.com")
    .secretKey(System.getenv("TOTOGGLE_SECRET_KEY"))
    .refreshInterval(Duration.ofMinutes(5))
    .enableOfflineMode(true) // keeps working even if the server is down
    .build()

val client = ToToggleClient(config)
client.start() // fetches toggles and starts automatic refresh`,
    `// Simple toggle
if (client.isActive("${tp}")) {
    // feature active — run the new behaviour
}

// With a parameter (for targeting rules)
if (client.isActive("${tp}", user.tier)) {
    // active only for the value configured in the rule
}

// Automatic cascading: parent off -> child returns false
val enabled = client.isActive("${tp}.new-sub-feature")

// On application shutdown
client.shutdown()`,
  ];
}

export function IntegrateStep({
  appName,
  togglePath,
  teamName,
  memberName,
  memberCreds,
  keyValue,
  codeTab,
  setCodeTab,
}: IntegrateStepProps) {
  const codes = integrationCodes(appName, togglePath);
  return (
    <div className="ob-integrate">
      <div className="ob-integrate-left">
        <div className="oil-emoji">🎉</div>
        <div className="oil-title">All set!</div>
        <div className="oil-sub">Here is what you created in this session:</div>
        <div className="oil-items">
          {teamName && (
            <div className="oil-item">
              <Icon name="check" size={14} /> Team: <b>{teamName}</b>
            </div>
          )}
          {memberName && (
            <div className="oil-item">
              <Icon name="check" size={14} /> Member: <b>{memberName}</b>
              {memberCreds && (
                <>
                  {" "}
                  — login <code>@{memberCreds.username}</code>, temp password <code>{memberCreds.tempPassword}</code>
                </>
              )}
            </div>
          )}
          {appName && (
            <div className="oil-item">
              <Icon name="check" size={14} /> Application: <b>{appName}</b>
            </div>
          )}
          {togglePath && (
            <div className="oil-item">
              <Icon name="check" size={14} /> Toggle: <code>{togglePath}</code>
            </div>
          )}
          {keyValue && (
            <div className="oil-item">
              <Icon name="check" size={14} /> Service key generated
            </div>
          )}
        </div>
        <div className="oil-next">
          <div className="oil-next-t">Next steps</div>
          <ul>
            <li>Add the dependency to your build</li>
            <li>Configure the client with the key</li>
            <li>
              Call <code>client.isActive()</code>
            </li>
            <li>Manage the toggles in the dashboard</li>
          </ul>
        </div>
      </div>
      <div className="ob-integrate-right">
        <div className="ob-tabs">
          {["Dependency", "Configuration", "Usage"].map((t, i) => (
            <button key={t} type="button" className={"ob-tab" + (codeTab === i ? " sel" : "")} onClick={() => setCodeTab(i)}>
              {t}
            </button>
          ))}
        </div>
        <OnboardingCodeBlock code={codes[codeTab]} />
      </div>
    </div>
  );
}
