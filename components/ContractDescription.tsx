import { ContractDefinition } from "@/types/contracts";

interface ContractDescriptionProps {
  contract: ContractDefinition;
}

export default function ContractDescription({ contract }: ContractDescriptionProps) {
  return (
    <section className="panel-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-slate-100 md:text-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Contract Description
          </h2>
          <p className="mt-1 text-sm text-slate-400">{contract.name}</p>
        </div>
        <span className="rounded-full border border-teal-400/35 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
          MBA Teaching Mode
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-200">{contract.description}</p>
      <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs leading-5 text-slate-300">
        {contract.teachingNote}
      </p>
    </section>
  );
}
