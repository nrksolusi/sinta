import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { monthName } from "@/lib/format";
import { queryClient } from "@/lib/query";
import { sessionQueryOptions } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/onboarding")({
  component: OnboardingWizard,
});

type CostingMethod = components["schemas"]["CostingMethod"];

const STEPS = ["profile", "costing", "warehouse"] as const;

// Defaults per ADR-0011: costing preselected to the segment-common method,
// fiscal year to January, first warehouse to the conventional main gudang.
function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pendingActivation, setPendingActivation] = useState(false);

  const form = useForm({
    defaultValues: {
      name: "",
      legalName: "",
      fiscalYearStartMonth: 1,
      costingMethod: "weightedAverage" as CostingMethod,
      warehouseCode: "GD-01",
      warehouseName: "Gudang Utama",
    },
    onSubmit: async ({ value }) => {
      setFailed(false);
      const { data } = await api.POST("/tenants", {
        body: {
          name: value.name,
          legalName: value.legalName || undefined,
          costingMethod: value.costingMethod,
          fiscalYearStartMonth: value.fiscalYearStartMonth,
          warehouse: { code: value.warehouseCode, name: value.warehouseName },
        },
      });
      if (!data) {
        setFailed(true);
        return;
      }
      // fetchQuery, not refetchQueries: login/register seed the session cache
      // via setQueryData, which leaves the cached query without a queryFn, so
      // refetchQueries would be a silent no-op and beforeLoad would bounce the
      // user back here. fetchQuery runs the queryFn from the options directly.
      await queryClient.fetchQuery(sessionQueryOptions);
      await router.invalidate();
      // Past the soft cap (ADR-0012) the tenant starts inactive - explain the
      // waiting state instead of dropping the user onto a 403'd dashboard.
      if (!data.active) {
        setPendingActivation(true);
        return;
      }
      await router.navigate({ to: "/" });
    },
  });

  const stepTitles = [
    m.onboarding_step_profile(),
    m.onboarding_step_costing(),
    m.onboarding_step_warehouse(),
  ];

  if (pendingActivation) {
    return (
      <main className="mx-auto w-full max-w-lg space-y-4 p-4">
        <h1 className="text-2xl font-semibold">
          {m.onboarding_pending_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.onboarding_pending_hint()}
        </p>
        <Button onClick={() => router.navigate({ to: "/" })}>
          {m.onboarding_pending_continue()}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 p-4">
      <h1 className="text-2xl font-semibold">{m.onboarding_title()}</h1>

      <ol className="flex gap-2 text-sm">
        {stepTitles.map((title, i) => (
          <li
            key={title}
            className={i === step ? "font-semibold" : "text-muted-foreground"}
          >
            {i + 1}. {title}
          </li>
        ))}
      </ol>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) {
            setStep(step + 1);
          } else {
            form.handleSubmit();
          }
        }}
      >
        {step === 0 && (
          <>
            <form.Field name="name">
              {(field) => (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {m.onboarding_company_name()}
                  </span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="legalName">
              {(field) => (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {m.onboarding_legal_name()}
                  </span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="fiscalYearStartMonth">
              {(field) => (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {m.onboarding_fiscal_month()}
                  </span>
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const name = monthName(i + 1);
                      return (
                        <option key={name} value={i + 1}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
            </form.Field>
          </>
        )}

        {step === 1 && (
          <form.Field name="costingMethod">
            {(field) => (
              <fieldset className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {m.onboarding_costing_hint()}
                </p>
                <label className="flex items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="costing"
                    checked={field.state.value === "weightedAverage"}
                    onChange={() => field.handleChange("weightedAverage")}
                  />
                  <span>
                    <span className="block font-medium">
                      {m.onboarding_costing_avg()}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {m.onboarding_costing_avg_hint()}
                    </span>
                  </span>
                </label>
                {/* FIFO ships in M2 (PLAN.md D15); the server rejects it until then. */}
                <label className="flex items-start gap-2 rounded-md border p-3 opacity-60">
                  <input type="radio" name="costing" disabled />
                  <span>
                    <span className="block font-medium">
                      {m.onboarding_costing_fifo()}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {m.onboarding_costing_fifo_soon()}
                    </span>
                  </span>
                </label>
              </fieldset>
            )}
          </form.Field>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">
              {m.onboarding_warehouse_hint()}
            </p>
            <form.Field name="warehouseCode">
              {(field) => (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {m.onboarding_warehouse_code()}
                  </span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="warehouseName">
              {(field) => (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {m.onboarding_warehouse_name()}
                  </span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </label>
              )}
            </form.Field>
          </>
        )}

        {failed && (
          <p className="text-sm text-red-600" role="alert">
            {m.onboarding_failed()}
          </p>
        )}

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            {m.onboarding_back()}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {step < STEPS.length - 1
                  ? m.onboarding_next()
                  : m.onboarding_submit()}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </main>
  );
}
