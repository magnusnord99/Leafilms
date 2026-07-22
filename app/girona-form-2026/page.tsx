import { createPublicClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Girona 2026 — Formkurven",
  robots: { index: false, follow: false },
};

type Rider = {
  id: string;
  name: string;
  flat_form: number;
  climb_form: number;
  prev_flat_form: number;
  prev_climb_form: number;
};

// Girona-fasadefarger — sykler nedover kortstabelen som en liten hilsen til husrekka langs elva
const FACADE_COLORS = [
  "#C2542B", // terrakotta
  "#E0A526", // oker
  "#D9776B", // laksa
  "#3F7D6B", // dus grønn
  "#C94F6D", // rosa
  "#2E6E8E", // middelhavsblå
];

function StatBar({
  label,
  icon,
  value,
  prevValue,
}: {
  label: string;
  icon: string;
  value: number;
  prevValue: number;
}) {
  const delta = value - prevValue;
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 shrink-0 text-center text-lg" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[#E8DFCF]/70">
            {label}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-display text-lg font-semibold text-[#F5EFE3]">
              {value}
              <span className="text-xs font-normal text-[#E8DFCF]/50">/10</span>
            </span>
            {delta !== 0 && (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[11px] font-bold " +
                  (delta > 0
                    ? "bg-[#4ADE80]/15 text-[#4ADE80]"
                    : "bg-[#F87171]/15 text-[#F87171]")
                }
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/25">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#E0A526] to-[#C2542B]"
            style={{ width: `${value * 10}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default async function GironaFormPage() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("girona_form")
    .select("id, name, flat_form, climb_form, prev_flat_form, prev_climb_form")
    .order("sort_order", { ascending: true });

  const riders = (data ?? []) as Rider[];
  const ranked = [...riders].sort(
    (a, b) => b.flat_form + b.climb_form - (a.flat_form + a.climb_form)
  );

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <main
      className="min-h-screen px-4 py-12 font-sans sm:px-6"
      style={{
        background:
          "radial-gradient(120% 100% at 50% 0%, #2E6E8E 0%, #1A3F4A 32%, #171314 75%)",
      }}
    >
      <div className="mx-auto max-w-xl">
        <header className="mb-10 text-center">
          <p className="mb-2 text-sm tracking-[0.3em] text-[#E0A526]">GIRONA · 2026</p>
          <h1 className="font-display text-4xl font-bold text-[#F5EFE3] sm:text-5xl">
            Formkurven 🚴
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#E8DFCF]/60">
            Live oversikt over formen før sykkelturen. Oppdateres manuelt, en
            gang i uka.
          </p>
        </header>

        <ol className="flex flex-col gap-4">
          {ranked.map((rider, i) => (
            <li
              key={rider.id}
              className="overflow-hidden rounded-2xl bg-[#211C18]/70 shadow-lg shadow-black/20 backdrop-blur-sm"
              style={{
                borderLeft: `5px solid ${FACADE_COLORS[i % FACADE_COLORS.length]}`,
              }}
            >
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-center text-base text-[#E8DFCF]/50">
                    {medals[i] ?? `#${i + 1}`}
                  </span>
                  <h2 className="font-display text-xl font-semibold text-[#F5EFE3]">
                    {rider.name}
                  </h2>
                </div>
                <div className="flex flex-col gap-2.5 pl-9">
                  <StatBar
                    label="Flatt"
                    icon="🚴"
                    value={rider.flat_form}
                    prevValue={rider.prev_flat_form}
                  />
                  <StatBar
                    label="Motbakke"
                    icon="⛰️"
                    value={rider.climb_form}
                    prevValue={rider.prev_climb_form}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>

        {ranked.length === 0 && (
          <p className="text-center text-[#E8DFCF]/60">Ingen data enda.</p>
        )}
      </div>
    </main>
  );
}
