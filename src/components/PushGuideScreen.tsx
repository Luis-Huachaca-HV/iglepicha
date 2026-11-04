import { GitPullRequest, CheckCircle2 } from 'lucide-react';

export default function PushGuideScreen() {
  return (
    <div className="min-h-screen bg-[#08120F] px-4 py-8 text-[#F3F7F3]">
      <main className="mx-auto max-w-2xl rounded-2xl border border-[#2B4A3B] bg-[#10231D] p-6">
        <div className="mb-6 flex items-start gap-3">
          <GitPullRequest className="mt-1 h-7 w-7 shrink-0 text-[#F4B942]" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold">Cómo hacer el push</h1>
            <p className="mt-2 text-[#B7C8BD]">Sigue estos pasos para llevar los cambios al repositorio.</p>
          </div>
        </div>
        <ol className="space-y-4 text-base leading-relaxed">
          <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#43C47A]" aria-hidden="true" /><span>Activa «Plan» en Cosmos Code y presiona «Aprobar y construir».</span></li>
          <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#43C47A]" aria-hidden="true" /><span>Cosmos creará una rama con los cambios y abrirá un pull request hacia <code className="rounded bg-[#18352A] px-1.5 py-0.5">main</code>.</span></li>
          <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#43C47A]" aria-hidden="true" /><span>Abre el pull request en GitHub, revisa los archivos y selecciona «Merge pull request».</span></li>
          <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#43C47A]" aria-hidden="true" /><span>Antes de fusionar, ejecuta la migración SQL 013 en Supabase. Después, Cloudflare podrá desplegar el cambio.</span></li>
        </ol>
      </main>
    </div>
  );
}
