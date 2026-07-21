import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/register")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

// Auth forms are deliberately defaults-free (ADR-0011).
function RegisterPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [failed, setFailed] = useState(false);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFailed(false);
      const registered = await api.POST("/auth/register", { body: value });
      if (!registered.data) {
        setFailed(true);
        return;
      }
      const login = await api.POST("/auth/login", {
        body: { email: value.email, password: value.password },
      });
      if (!login.data) {
        setFailed(true);
        return;
      }
      queryClient.setQueryData(["session"], login.data);
      await navigate({ to: redirect ?? "/" });
    },
  });

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <h1 className="text-2xl font-semibold">{m.register_title()}</h1>

        <form.Field name="name">
          {(field) => (
            <label className="block space-y-1">
              <span className="text-sm font-medium">{m.register_name()}</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                autoComplete="name"
                required
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <label className="block space-y-1">
              <span className="text-sm font-medium">{m.login_email()}</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                type="email"
                autoComplete="email"
                required
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <label className="block space-y-1">
              <span className="text-sm font-medium">{m.login_password()}</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>

        {failed && (
          <p className="text-sm text-red-600" role="alert">
            {m.register_failed()}
          </p>
        )}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {m.register_submit()}
            </Button>
          )}
        </form.Subscribe>

        <p className="text-center text-sm">
          <Link to="/login" search={{ redirect }} className="underline">
            {m.register_have_account()}
          </Link>
        </p>
      </form>
    </main>
  );
}
