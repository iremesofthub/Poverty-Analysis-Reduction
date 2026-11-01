import React from "react";

export default function AuthLayout({ title, subtitle, footer, wide = false, children }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f3f4f2] px-4 py-8 text-foreground sm:py-10">
      <div className={`w-full ${wide ? "max-w-[520px]" : "max-w-[400px]"}`}>
        <header className="mb-6 text-center sm:mb-7">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-ink text-sm font-semibold tracking-tight text-white shadow-sm" aria-label="Ireme Insight">
            IR
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-ink sm:text-[24px]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-sub">{subtitle}</p>}
        </header>

        <section className="rounded-xl border border-[#e2e4e1] bg-white p-5 shadow-sm sm:p-8">
          {children}
          {footer && <div className="mt-7 border-t border-[#eceeeb] pt-5 text-center text-sm text-sub">{footer}</div>}
        </section>

        <p className="mt-6 text-center text-[11px] text-sub sm:mt-7">
          NISR Big Data Hackathon · Track 2
        </p>
      </div>
    </main>
  );
}
