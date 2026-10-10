import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOGO_URL } from '@/components/Logo';

const LogoScene = lazy(() => import('./LogoScene'));
const WORDS = ['REMO', 'AIRBIKE', 'KETTLEBELL', 'WALL BALLS', 'SLED', 'BURPEES', 'SKIERG', 'DEADLIFT'];

export function Intro({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const readyScene = useCallback(() => setReady(true), []);
  const closeAudio = () => { void audio.current?.close().catch(() => {}); audio.current = null; gain.current = null; };
  useEffect(() => () => closeAudio(), []);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const interval = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 80);
    const timer = window.setTimeout(onDone, 10000);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [running, onDone]);

  const enableAudio = async () => {
    try {
      if (!audio.current) {
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        const context = new Audio(); audio.current = context;
        const master = context.createGain(); master.gain.value = .18; master.connect(context.destination); gain.current = master;
        // Original rhythmic synth score, scheduled after a user gesture.
        for (let beat = 0; beat < 24; beat++) {
          const at = context.currentTime + beat * .375;
          const oscillator = context.createOscillator(); const envelope = context.createGain();
          oscillator.type = beat % 4 === 0 ? 'sine' : 'triangle';
          oscillator.frequency.setValueAtTime(beat % 4 === 0 ? 140 : 440 * Math.pow(2, (beat % 3) / 12), at);
          oscillator.frequency.exponentialRampToValueAtTime(beat % 4 === 0 ? 45 : 220, at + .15);
          envelope.gain.setValueAtTime(.001, at); envelope.gain.exponentialRampToValueAtTime(.65, at + .012); envelope.gain.exponentialRampToValueAtTime(.001, at + .22);
          oscillator.connect(envelope); envelope.connect(master); oscillator.start(at); oscillator.stop(at + .25);
        }
      }
      await audio.current?.resume();
      if (gain.current && audio.current?.state === 'running') { gain.current.gain.value = .18; setMuted(false); }
    } catch { setMuted(true); }
  };
  const start = (sound: boolean) => { if (sound) void enableAudio(); setRunning(true); };
  const toggleSound = () => {
    if (muted) void enableAudio();
    else { if (gain.current) gain.current.gain.value = 0; setMuted(true); }
  };
  return (
    <div className={`intro-stage fixed inset-0 z-50 overflow-hidden bg-background ${elapsed > 9 ? 'intro-ending' : ''}`} role="dialog" aria-label="Presentación Centro Funcional">
      <Suspense fallback={null}><LogoScene running={running} onReady={readyScene} /></Suspense>
      {!ready && <img src={LOGO_URL} alt="Centro Funcional" className="absolute inset-0 m-auto h-64 w-64 object-contain" />}
      <div className="absolute inset-x-0 top-7 text-center font-display text-xl font-extrabold uppercase text-foreground">Centro <span className="text-primary">Funcional</span></div>
      {!running ? (
        <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6">
          <Button size="lg" onClick={() => start(true)}><Play />Iniciar con sonido</Button>
          <Button variant="ghost" onClick={() => start(false)}>Ver sin sonido</Button>
        </div>
      ) : elapsed < 7.5 && <div key={Math.floor(elapsed / .9)} className="intro-word absolute inset-x-0 bottom-24 text-center font-display text-3xl font-black italic text-primary">{WORDS[Math.min(Math.floor(elapsed / .9), WORDS.length - 1)]}</div>}
      <div className="absolute inset-x-0 bottom-5 flex items-center justify-between px-5">
        <Button variant="outline" size="icon" onClick={toggleSound} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} title={muted ? 'Activar sonido' : 'Silenciar sonido'}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        <Button variant="ghost" onClick={onDone}><SkipForward />Saltar</Button>
      </div>
    </div>
  );
}