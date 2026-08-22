// Cliente HTTP fino para a API do ToToggle (docs/rest-flow.md). Same-origin sempre
// (cookie auth_token é SameSite=Strict) — nunca aponte para outra origem.

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
  const res = await fetch(path, {
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
