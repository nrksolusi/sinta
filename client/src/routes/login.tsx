import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "@/components/login-form";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <LoginForm
        onSuccess={async (session) => {
          queryClient.setQueryData(["session"], session);
          await navigate({ to: redirect ?? "/" });
        }}
      />
      <p className="text-sm">
        <Link to="/register" search={{ redirect }} className="underline">
          {m.login_no_account()}
        </Link>
      </p>
    </main>
  );
}
