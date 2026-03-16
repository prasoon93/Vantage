import { useRef, useEffect } from 'react';
import './Waveform.css';

export function Waveform({ appState, analyserRef }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    function drawIdle() {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const t = Date.now() / 800;
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(201,162,39,0.2)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x / 30 + t) * 4 + Math.sin(x / 15 + t * 1.3) * 2;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(drawIdle);
    }

    function drawLive() {
      const analyser = analyserRef?.current;
      if (!analyser) { drawIdle(); return; }

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const dataArr = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArr);

      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.strokeStyle = '#e84040';
      ctx.lineWidth = 2;

      const sliceW = w / dataArr.length;
      let x = 0;
      for (let i = 0; i < dataArr.length; i++) {
        const y = (dataArr[i] / 128.0) * (h / 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      rafRef.current = requestAnimationFrame(drawLive);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (appState === 'listening') {
      drawLive();
    } else {
      drawIdle();
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [appState, analyserRef]);

  return (
    <div className="waveform">
      <canvas ref={canvasRef} className="waveform__canvas" />
    </div>
  );
}
