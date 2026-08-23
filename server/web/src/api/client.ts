// Cliente HTTP fino para a API do ToToggle (docs/rest-flow.md). Same-origin sempre
// (cookie auth_token é SameSite=Strict) — nunca aponte para outra origem.
//
// Toda a API de sessão vive sob /api (routes.go) — separado de propósito das rotas SPA,
// que nunca usam esse prefixo (antes /teams, /applications/:id etc. eram, ao mesmo tempo,
// o path da tela E da rota de API; um hard refresh nessas telas devolvia o JSON cru da
// API em vez da casca do SPA). apiFetch prefixa "/api" automaticamente — os módulos em
// api/*.ts continuam passando paths "crus" (ex.: "/teams"), sem precisar saber do prefixo.

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { field: string; message: string }[];

  constructor(status: number, message: string, code?: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // corpo vazio/não-JSON — segue com mensagem genérica
  }
  const b = (body ?? {}) as Record<string, unknown>;
  // Dois formatos de erro convivem na API: padrão {code,message,details} e legado {error}.
  const message = (b.message as string) ?? (b.error as string) ?? res.statusText;
  return new ApiError(res.status, message, b.code as string | undefined, b.details as ApiError["details"]);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw await parseErrorBody(res);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}
