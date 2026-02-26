export default function MethodologyStep({ stepNumber, title, icon, children }) {
  return (
    <article className="method-step p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="method-step-icon flex h-10 w-10 items-center justify-center rounded-full text-lg">
          <span aria-hidden="true">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">Step {stepNumber}</p>
          <h3 className="mt-1 text-base font-bold text-strong">{title}</h3>
          <div className="mt-3 space-y-3">{children}</div>
        </div>
      </div>
    </article>
  );
}
