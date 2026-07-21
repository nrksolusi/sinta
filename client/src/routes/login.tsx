import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "@/components/login-form";
import { queryClient } from "@/lib/query";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <LoginForm
        onSuccess={async (session) => {
          queryClient.setQueryData(["session"], session);
          await navigate({ to: "/" });
        }}
      />
    </main>
  );
}
