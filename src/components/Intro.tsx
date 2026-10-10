import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOGO_URL } from '@/components/Logo';
import footage from '@/assets/gym-intro.mp4.asset.json';
import alternateFootage from '@/assets/gym-intro.webm.asset.json';

const LogoScene = lazy(() => import('./LogoScene'));

export function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'video' | 'logo'>('idle');
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ending, setEnding] = useState(false);
  const [crossfade, setCrossfade] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const readyScene = useCallback(() => setReady(true), []);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);
  useEffect(() => {
    if (phase !== 'logo') return;
    const fade = setTimeout(() => setEnding(true), 3200);
    const done = setTimeout(onDone, 4000);
    // Original short rhythmic outro continues the generated clip's soundtrack.
    const context = audio.current;
    if (context && gain.current) {
      for (let beat = 0; beat < 10; beat++) {
        const at = context.currentTime + beat * .375;
        const osc = context.createOscillator(), envelope = context.createGain();
        osc.frequency.setValueAtTime(beat % 4 === 0 ? 140 : 440, at);
        osc.frequency.exponentialRampToValueAtTime(beat % 4 === 0 ? 45 : 220, at + .15);
        envelope.gain.setValueAtTime(.001, at); envelope.gain.exponentialRampToValueAtTime(.55, at + .012); envelope.gain.exponentialRampToValueAtTime(.001, at + .22);
        osc.connect(envelope); envelope.connect(gain.current); osc.start(at); osc.stop(at + .25);
      }
    }
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [phase, onDone]);

  const unlockAudio = () => {
    try {
      if (!audio.current) {
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Audio) {
          audio.current = new Audio(); gain.current = audio.current.createGain();
          gain.current.gain.value = .16; gain.current.connect(audio.current.destination);
        }
      }
      void audio.current?.resume().catch(() => {});
    } catch { /* The video's own audio remains available. */ }
  };
  const start = async (sound: boolean) => {
    const player = video.current;
    if (!player) return;
    setFailed(false); setCrossfade(false);
    player.currentTime = 0; player.muted = !sound; player.volume = .75;
    setMuted(!sound);
    unlockAudio(); if (gain.current) gain.current.gain.value = sound ? .16 : 0;
    try { await player.play(); setPhase('video'); }
    catch {
      player.muted = true; setMuted(true); if (gain.current) gain.current.gain.value = 0;
      try { await player.play(); setPhase('video'); } catch { setFailed(true); }
    }
  };
  const toggleSound = () => {
    const nextMuted = !muted;
    unlockAudio();
    if (video.current) video.current.muted = nextMuted;
    if (gain.current) gain.current.gain.value = nextMuted ? 0 : .16;
    setMuted(nextMuted);
  };
  return (
    <div className={`intro-stage fixed inset-0 z-50 overflow-hidden bg-background ${ending ? 'intro-ending' : ''}`} role="dialog" aria-label="Presentación Centro Funcional">
      <Suspense fallback={null}><LogoScene running={phase === 'logo'} onReady={readyScene} /></Suspense>
      {!ready && <img src={LOGO_URL} alt="Centro Funcional" className="absolute inset-0 m-auto h-64 w-64 object-contain" />}
      <video ref={video} preload="auto" playsInline muted={muted} aria-label="Ejercicios de remo, airbike y kettlebell" className={`intro-footage absolute inset-0 h-full w-full bg-background object-contain ${phase === 'video' && !crossfade ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onTimeUpdate={() => { const player = video.current; if (player && player.duration && player.currentTime > player.duration - .4) setCrossfade(true); }} onEnded={() => setPhase('logo')} onError={() => setFailed(true)}>
        <source src={footage.url} type="video/mp4" />
        <source src={alternateFootage.url} type="video/webm" />
      </video>
      <div className="absolute inset-x-0 top-7 text-center font-display text-xl font-extrabold uppercase text-foreground">Centro <span className="text-primary">Funcional</span></div>
      {phase === 'idle' && <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6">
        <Button size="lg" onClick={() => void start(true)}><Play />Iniciar con sonido</Button>
        <Button variant="ghost" onClick={() => void start(false)}>Ver sin sonido</Button>
        {failed && <p className="text-sm text-destructive">No se pudo reproducir. Vuelve a intentarlo o pulsa Saltar.</p>}
      </div>}
      <div className="absolute inset-x-0 bottom-5 flex items-center justify-between px-5">
        <Button variant="outline" size="icon" onClick={toggleSound} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} title={muted ? 'Activar sonido' : 'Silenciar sonido'}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        <Button variant="ghost" onClick={onDone}><SkipForward />Saltar</Button>
      </div>
    </div>
  );
}
