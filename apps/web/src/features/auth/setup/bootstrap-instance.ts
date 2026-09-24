import { apiFetch, authFetch } from "@/platform/network/api";

export async function bootstrapInstance(form: FormData, onBootstrapped: () => void) {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  await apiFetch("/api/instance/bootstrap", {
    auth: false,
    body: JSON.stringify({
      email,
      name: String(form.get("name") ?? "").trim(),
      password,
      workspaceName: String(form.get("workspaceName") ?? "").trim(),
    }),
    headers: {
      "x-zilobase-bootstrap-token": String(form.get("bootstrapToken") ?? "").trim(),
    },
    method: "POST",
  });

  onBootstrapped();
  await authFetch("/sign-in/email", { email, password });
}
