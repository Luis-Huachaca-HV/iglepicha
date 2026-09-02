// Genera un pitido tipo silbato con la Web Audio API, sin depender de
// ningún archivo .mp3 externo. Se dispara localmente en cada dispositivo
// cuando su propio cronómetro llega a 00:00 (todos parten del mismo
// inicio_ts, así que suena prácticamente al mismo tiempo en todos).
export function reproducirSilbato() {
  try {
    const ContextoAudio = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new ContextoAudio();
    const ahora = ctx.currentTime;

    [0, 0.35].forEach((retraso) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(2200, ahora + retraso);
      gain.gain.setValueAtTime(0.0001, ahora + retraso);
      gain.gain.exponentialRampToValueAtTime(0.25, ahora + retraso + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ahora + retraso + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ahora + retraso);
      osc.stop(ahora + retraso + 0.3);
    });

    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Si el navegador bloquea audio sin interacción previa, simplemente no suena.
  }
}
