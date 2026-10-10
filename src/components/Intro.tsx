import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOGO_URL } from '@/components/Logo';
import footage from '@/assets/gym-smooth.mp4.asset.json';
import alternateFootage from '@/assets/gym-smooth.webm.asset.json';
import music from '@/assets/dance-intro.mp3.asset.json';

const LogoScene = lazy(() => import('./LogoScene'));

export function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'video' | 'logo'>('video');
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ending, setEnding] = useState(false);
  const [crossfade, setCrossfade] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const fadeStarted = useRef<number | null>(null);
  const logoStarted = useRef<number | null>(null);
  const soundAttempted = useRef(false);
  const readyScene = useCallback(() => setReady(true), []);
  useEffect(() => {
    const player = video.current;
    const soundtrack = audio.current;
    if (!player || !soundtrack) return;
    player.muted = true;
    void player.play().catch(() => setFailed(true));
    soundtrack.volume = .75;
    // Playback starts with the first moving frame, keeping both media clocks aligned.
    return () => { player.pause(); soundtrack.pause(); };
  }, []);
  useEffect(() => {
    if (phase !== 'logo') return;
    logoStarted.current = performance.now();
    if (audio.current && !muted) {
      audio.current.currentTime = 6;
      void audio.current.play().catch(() => {});
    }
    const fade = setTimeout(() => setEnding(true), 3200);
    const done = setTimeout(onDone, 4000);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [phase, onDone]);
  useEffect(() => {
    if (!ending) return;
    fadeStarted.current = performance.now();
    const initialVolume = audio.current?.volume ?? .75;
    const timer = setInterval(() => {
      const soundtrack = audio.current;
      const started = fadeStarted.current;
      if (!soundtrack || started === null) return;
      soundtrack.volume = initialVolume * Math.max(0, 1 - (performance.now() - started) / 750);
    }, 30);
    return () => clearInterval(timer);
  }, [ending]);

  const start = async () => {
    const player = video.current;
    if (!player) return;
    setFailed(false); setCrossfade(false);
    player.muted = true;
    try { await player.play(); setPhase('video'); }
    catch { setFailed(true); }
  };
  const toggleSound = async () => {
    const soundtrack = audio.current;
    if (!soundtrack) return;
    if (!muted) { soundtrack.pause(); setMuted(true); return; }
    soundtrack.currentTime = phase === 'video' ? video.current?.currentTime ?? 0 : Math.min(9.9, 6 + (performance.now() - (logoStarted.current ?? performance.now())) / 1000);
    try { await soundtrack.play(); setMuted(false); } catch { setMuted(true); }
  };
  return (
    <div className={`intro-stage fixed inset-0 z-50 overflow-hidden bg-background ${ending ? 'intro-ending' : ''}`} role="dialog" aria-label="Presentación Centro Funcional">
      <div className={`intro-footage absolute inset-0 ${phase === 'video' && !crossfade ? 'opacity-0' : 'opacity-100'}`}>{(crossfade || phase === 'logo') && <Suspense fallback={null}><LogoScene running={phase === 'logo'} onReady={readyScene} /></Suspense>}</div>
      {!ready && phase === 'logo' && <img src={LOGO_URL} alt="Centro Funcional" className="absolute inset-0 m-auto h-32 w-32 object-contain" />}
      <audio ref={audio} src={music.url} preload="auto" />
      <video ref={video} autoPlay preload="auto" playsInline muted aria-label="Ejercicios de remo, airbike y kettlebell" className={`intro-footage absolute inset-0 h-full w-full bg-background object-cover ${phase === 'video' && !crossfade ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onPlaying={() => { const soundtrack = audio.current; if (!soundtrack) return; soundtrack.currentTime = video.current?.currentTime ?? 0; if (!soundAttempted.current || !muted) { soundAttempted.current = true; void soundtrack.play().then(() => setMuted(false)).catch(() => setMuted(true)); } }} onWaiting={() => audio.current?.pause()} onTimeUpdate={() => { const player = video.current; const soundtrack = audio.current; if (player && soundtrack && !muted && Math.abs(player.currentTime - soundtrack.currentTime) > .15) soundtrack.currentTime = player.currentTime; if (player && player.duration && player.currentTime > player.duration - .4) setCrossfade(true); }} onEnded={() => setPhase('logo')} onError={() => setFailed(true)}>
        <source src={footage.url} type="video/mp4" />
        <source src={alternateFootage.url} type="video/webm" />
      </video>
      {failed && <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6">
        <Button size="lg" onClick={() => void start()}><Play />Reproducir vídeo</Button>
      </div>}
      <div className="absolute inset-x-0 bottom-5 flex items-center justify-between px-5">
        <Button variant="outline" size="icon" onClick={() => void toggleSound()} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} title={muted ? 'Activar sonido' : 'Silenciar sonido'}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        <Button variant="ghost" onClick={onDone}><SkipForward />Saltar</Button>
      </div>
    </div>
  );
}
