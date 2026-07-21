import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SessionInfo } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function LoginForm({
  onSuccess,
}: {
  onSuccess: (session: SessionInfo) => void | Promise<void>;
}) {
  const [failed, setFailed] = useState(false);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFailed(false);
      const { data } = await api.POST("/auth/login", { body: value });
      if (!data) {
        setFailed(true);
        return;
      }
      await onSuccess(data);
    },
  });

  return (
    <form
      className="w-full max-w-sm space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <h1 className="text-2xl font-semibold">{m.login_title()}</h1>

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
              autoComplete="current-password"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </label>
        )}
      </form.Field>

      {failed && (
        <p className="text-sm text-red-600" role="alert">
          {m.login_failed()}
        </p>
      )}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {m.login_submit()}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
