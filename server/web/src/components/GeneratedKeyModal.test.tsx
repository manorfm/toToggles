import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratedKeyModal } from "./GeneratedKeyModal";

describe("GeneratedKeyModal", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("shows the plain key and keeps Done disabled until acknowledged", async () => {
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    expect(screen.getByText("sk_abc123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("button", { name: /done/i })).toBeEnabled();
  });

  it("copies the key to the clipboard and shows feedback", async () => {
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy key/i }));

    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("calls onClose only once acknowledged", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={onClose} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not let the scrim click close the modal before acknowledging", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={onClose} />);

    await user.click(screen.getByTestId("modal-scrim"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("warns that the key is not active yet when pendingApproval is set", () => {
    render(<GeneratedKeyModal plainKey="sk_abc123" pendingApproval onClose={vi.fn()} />);

    expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
    expect(screen.getByText(/will not work yet/i)).toBeInTheDocument();
  });

  it("shows the plain regenerated-key copy when pendingApproval is not set", () => {
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    expect(screen.queryByText(/pending approval/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/will not work yet/i)).not.toBeInTheDocument();
  });

  // Achado numa varredura posterior contra get_full_jsx("ServiceKeyModal"): o confirmado tem um
  // título próprio pra rotação ("New service key generated") que nunca tinha sido portado — a
  // distinção entre 1ª geração e rotação já era computada em SecretKeySection.tsx (pra decidir se
  // mostra confirmação antes), só nunca chegava até este modal. O aviso extra do confirmado
  // ("The previous key was revoked") foi deliberadamente NÃO portado — seria falso no nosso
  // modelo de overlap (v2.6 §5.1: a chave anterior continua válida até ser revogada de verdade),
  // e contradiria o aviso correto que SecretKeySection.tsx já mostra logo em seguida.
  it("titles itself 'New service key generated' when rotated", () => {
    render(<GeneratedKeyModal plainKey="sk_abc123" rotated onClose={vi.fn()} />);

    expect(screen.getByText("New service key generated")).toBeInTheDocument();
  });

  it("titles itself plainly for a first-time key", () => {
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    expect(screen.getByText("Service key generated")).toBeInTheDocument();
  });

  it("includes the application name in the subtitle when given", () => {
    render(<GeneratedKeyModal plainKey="sk_abc123" appName="Checkout Web" onClose={vi.fn()} />);

    expect(screen.getByText(/Checkout Web · shown once — save it now before closing/i)).toBeInTheDocument();
  });
});
