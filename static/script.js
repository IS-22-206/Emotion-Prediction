(() => {
  const $ = (s) => document.querySelector(s);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* How each emotion behaves. dir: where the emoji drift (1 up, -1 down, 'out' burst, 0 flicker) */
  const EMO = {
    neutral: { c1: '#8b93ff', c2: '#1d2040', amp: .12, freq: 2.0, speed: .6, sharp: 1,  grav: 0,   spread: .15, jit: .05, swirl: .15, pulse: .02, pSpeed: 1.5, squash: 1,   shake: 0,    size: .05,  burst: 0 },
    joy:      { emoji: '😊', dir: 1,    c1: '#ffd23f', c2: '#ff7a00', amp: .26, freq: 2.2, speed: 1.7, sharp: 1,  grav: .7,  spread: .7,  jit: .3,  swirl: .1,  pulse: .12, pSpeed: 7,   squash: 1,   shake: 0,    size: .065, burst: 1.2 },
    sadness:  { emoji: '😢', dir: -1,   c1: '#4f7cff', c2: '#0f1a52', amp: .09, freq: 1.2, speed: .3,  sharp: 1,  grav: -1,  spread: .1,  jit: .02, swirl: 0,   pulse: .02, pSpeed: 1,   squash: .82, shake: 0,    size: .045, burst: .2 },
    anger:    { emoji: '😡', dir: 'out', c1: '#ff2d2d', c2: '#6b0000', amp: .36, freq: 5.0, speed: 3.4, sharp: .45, grav: 1,   spread: 1.2, jit: .9,  swirl: .3,  pulse: .05, pSpeed: 12,  squash: 1,   shake: .05,  size: .05,  burst: 1.8 },
    fear:     { emoji: '😱', dir: 0,    c1: '#a07bff', c2: '#14092e', amp: .15, freq: 7.0, speed: 4.6, sharp: .8, grav: 0,   spread: .1,  jit: 1.3, swirl: 0,   pulse: -.1, pSpeed: 14,  squash: 1,   shake: .018, size: .035, burst: .1 },
    love:     { emoji: '😘', dir: 1,    c1: '#ff4f9a', c2: '#7a1049', amp: .15, freq: 1.8, speed: 1.1, sharp: 1,  grav: .4,  spread: .4,  jit: .1,  swirl: .8,  pulse: .14, pSpeed: 5,   squash: 1,   shake: 0,    size: .058, burst: .8 },
    surprise: { emoji: '😲', dir: 'out', c1: '#35e0ff', c2: '#0a3d6b', amp: .3,  freq: 3.5, speed: 2.4, sharp: 1,  grav: 0,   spread: 2.2, jit: .2,  swirl: 0,   pulse: .04, pSpeed: 3,   squash: 1,   shake: 0,    size: .062, burst: 3.2 },
  };
  const KEYS = ['amp','freq','speed','sharp','grav','spread','jit','swirl','pulse','pSpeed','squash','shake','size'];
  const ORDER = ['joy','sadness','anger','fear','love','surprise'];

  /* ---------------------------------------------------------- 3D scene */
  function initGfx() {
    const noop = { set() {}, burst() {}, energy() {}, loading() {} };
    if (!window.THREE) return noop;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true, alpha: true }); }
    catch (e) { $('#scene').remove(); return noop; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, 1, .1, 100);
    cam.position.z = 5;
    const group = new THREE.Group();
    scene.add(group);

    const cur = {}; KEYS.forEach(k => cur[k] = EMO.neutral[k]);
    const tgt = { ...EMO.neutral };
    const c1 = new THREE.Color(EMO.neutral.c1), c2 = new THREE.Color(EMO.neutral.c2);
    const t1 = new THREE.Color(EMO.neutral.c1), t2 = new THREE.Color(EMO.neutral.c2);

    const U = { uTime: { value: 0 }, uAmp: { value: .12 }, uFreq: { value: 2 }, uSharp: { value: 1 }, uC1: { value: c1 }, uC2: { value: c2 } };
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: `
          uniform float uTime,uAmp,uFreq,uSharp;
          varying vec3 vN; varying vec3 vV; varying float vD;
          void main(){
            vec3 p=position;
            float d=sin(p.x*uFreq+uTime)*sin(p.y*uFreq*1.3+uTime*1.2)*sin(p.z*uFreq*.9-uTime*.8);
            d=sign(d)*pow(abs(d),uSharp);
            vD=d;
            p+=normal*d*uAmp*2.2;
            vec4 mv=modelViewMatrix*vec4(p,1.);
            vN=normalize(normalMatrix*normal);
            vV=normalize(-mv.xyz);
            gl_Position=projectionMatrix*mv;
          }`,
        fragmentShader: `
          uniform vec3 uC1,uC2; varying vec3 vN; varying vec3 vV; varying float vD;
          void main(){
            vec3 n=normalize(vN);
            float rim=pow(1.-max(dot(n,normalize(vV)),0.),2.4);
            float lit=max(dot(n,normalize(vec3(.4,.7,.6))),0.);
            vec3 base=mix(uC2,uC1,clamp(vD*.8+.45,0.,1.));
            vec3 col=base*(.4+.7*lit)+uC1*rim*1.1;
            gl_FragColor=vec4(col,1.);
          }`,
      })
    );
    group.add(orb);

    // soft halo
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    const g = glowCv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCv);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c1, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(5, 5, 1);
    group.add(halo);

    // orbit rings + shockwave
    const ringMat = () => new THREE.MeshBasicMaterial({ color: c1, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.7, .006, 8, 220), ringMat());
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(2.05, .005, 8, 220), ringMat());
    r1.rotation.x = 1.25; r2.rotation.set(.5, .9, 0);
    group.add(r1, r2);
    const shockMat = new THREE.MeshBasicMaterial({ color: c1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shock = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 128), shockMat);
    group.add(shock);

    // particles
    const N = RM ? 150 : 650;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const dotCv = document.createElement('canvas'); dotCv.width = dotCv.height = 32;
    const d = dotCv.getContext('2d'), dg = d.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = dg; d.fillRect(0, 0, 32, 32);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({ size: .05, map: new THREE.CanvasTexture(dotCv), color: c1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    group.add(points);

    function spawn(i, fill) {
      const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(ph) * Math.cos(th), dy = Math.sin(ph) * Math.sin(th), dz = Math.cos(ph);
      let r = 1.25 + Math.random() * (fill ? 3.5 : .3), x = dx * r, y = dy * r, z = dz * r;
      if (cur.grav < -.3 && !fill) { x = (Math.random() - .5) * 7; y = 3.6; z = (Math.random() - .5) * 4; } // rain
      const s = (.2 + Math.random()) * cur.spread;
      pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
      vel[3 * i] = dx * s; vel[3 * i + 1] = dy * s; vel[3 * i + 2] = dz * s;
    }
    for (let i = 0; i < N; i++) spawn(i, true);

    let mode = 'neutral', t = 0, rt = 0, last = performance.now();
    let en = 0, pop = 0, popK = 1, shk = 0, busy = false;
    let mx = 0, my = 0, baseX = 0, baseY = 0, baseS = 1;

    function resize() {
      const w = innerWidth, h = innerHeight, a = w / h;
      renderer.setSize(w, h, false);
      cam.aspect = a; cam.updateProjectionMatrix();
      if (a > 1.05) { baseX = Math.min(1.7, a * .72); baseY = 0; baseS = 1; }
      else { baseX = 0; baseY = 1.15; baseS = .72; }
    }
    addEventListener('resize', resize); resize();
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; });
    $('#scene').addEventListener('click', () => api.burst(.7, true));

    function burst(k, ring) {
      const kk = k * (.6 + Math.random() * .4);
      for (let i = 0; i < N; i++) {
        const x = pos[3*i], y = pos[3*i+1], z = pos[3*i+2], l = Math.hypot(x, y, z) || 1, f = kk * (.5 + Math.random());
        vel[3*i] += x / l * f; vel[3*i+1] += y / l * f; vel[3*i+2] += z / l * f;
      }
      pop = 1; popK = Math.min(1.4, .25 + k * .3); shk = ring ? 1 : 1;
      shockMat.opacity = .7; shock.scale.setScalar(1);
    }

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      rt += dt;
      const k = 1 - Math.exp(-dt * 2.6);
      KEYS.forEach(key => cur[key] += (tgt[key] - cur[key]) * k);
      c1.lerp(t1, k); c2.lerp(t2, k);
      en *= Math.exp(-dt * 1.6);

      t += dt * cur.speed * (1 + en * 1.4 + (busy ? 2.5 : 0));
      U.uTime.value = t;
      U.uAmp.value = cur.amp + en * .06;
      U.uFreq.value = cur.freq; U.uSharp.value = cur.sharp;
      pMat.color.copy(c1); halo.material.color.copy(c1);
      r1.material.color.copy(c1); r2.material.color.copy(c1); shockMat.color.copy(c1);
      pMat.size += (cur.size - pMat.size) * k;

      // pulse: heartbeat for love, bounce otherwise
      let p;
      if (mode === 'love') { const s = rt * cur.pSpeed; p = Math.pow(Math.max(0, Math.sin(s)), 6) + .6 * Math.pow(Math.max(0, Math.sin(s - 1)), 6); }
      else p = Math.abs(Math.sin(rt * cur.pSpeed));
      pop = Math.max(0, pop - dt * 1.4);
      const sc = (1 + cur.pulse * p + pop * pop * popK * .45) * baseS;
      orb.scale.set(sc, sc * cur.squash, sc);
      orb.position.y = (cur.squash - 1) * .9 * baseS;
      halo.material.opacity = (mode === 'fear' ? .25 + Math.random() * .4 : .5) + pop * .3;
      const halfScale = 4.6 + p * .6 * Math.abs(cur.pulse) * 10; halo.scale.set(halfScale, halfScale, 1);

      orb.rotation.y += dt * .25 * (1 + cur.speed * .2);
      r1.rotation.z += dt * .3 * (1 + en); r2.rotation.z -= dt * .2 * (1 + en);
      r1.material.opacity = .22 + p * .1; r2.material.opacity = .16 + p * .08;

      // shockwave
      if (shockMat.opacity > 0) {
        shockMat.opacity = Math.max(0, shockMat.opacity - dt * .9);
        shock.scale.setScalar(shock.scale.x + dt * (2.8 + popK * 2));
      }

      // group follow + parallax + shake
      shk = Math.max(0, shk - dt * 2);
      const sh = cur.shake * (1 + (busy ? 0 : 0));
      group.position.x += (baseX + mx * .15 - group.position.x) * .08 + (Math.random() - .5) * sh;
      group.position.y += (baseY - my * .1 - group.position.y) * .08 + (Math.random() - .5) * sh;
      group.rotation.y += (mx * .45 - group.rotation.y) * .05;
      group.rotation.x += (my * .3 - group.rotation.x) * .05;

      // particles
      const damp = 1 - dt * .5, jit = cur.jit * dt * 6;
      for (let i = 0; i < N; i++) {
        const ix = 3 * i, iy = ix + 1, iz = ix + 2;
        vel[ix] += (Math.random() - .5) * jit - pos[iz] * cur.swirl * dt;
        vel[iy] += (Math.random() - .5) * jit + cur.grav * dt;
        vel[iz] += (Math.random() - .5) * jit + pos[ix] * cur.swirl * dt;
        vel[ix] *= damp; vel[iy] *= damp; vel[iz] *= damp;
        pos[ix] += vel[ix] * dt; pos[iy] += vel[iy] * dt; pos[iz] += vel[iz] * dt;
        if (Math.abs(pos[iy]) > 4.2 || Math.hypot(pos[ix], pos[iz]) > 6) spawn(i, false);
      }
      pGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, cam);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const api = {
      set(name) {
        const e = EMO[name] || EMO.neutral; mode = EMO[name] ? name : 'neutral';
        KEYS.forEach(key => tgt[key] = e[key]);
        t1.set(e.c1); t2.set(e.c2);
        burst(e.burst, true);
      },
      burst,
      energy(v) { en = Math.min(1, en + v); },
      loading(b) { busy = b; },
    };
    return api;
  }
  const gfx = initGfx();

  /* ---------------------------------------------------------- UI */
  const ta = $('#text'), go = $('#go'), errEl = $('#err'), res = $('#result'), statusEl = $('#status');
  // const EXAMPLES = [
  //   ['😊', 'I just got the job offer I have been dreaming about!'],
  //   ['😢', 'I miss the way things used to be.'],
  //   ['😡', 'How dare you lie to my face again!'],
  //   ['😱', 'Someone is standing outside my window right now.'],
  //   ['😘', 'You make every ordinary day feel magical.'],
  //   ['😲', 'Wait, you remembered my birthday?!'],
  // ];
  // $('#chips').innerHTML = EXAMPLES.map(([e, s], i) => `<button class="chip" type="button" data-i="${i}">${e} ${s.split(' ').slice(0, 3).join(' ')}…</button>`).join('');
  // $('#chips').addEventListener('click', e => {
  //   const b = e.target.closest('.chip'); if (!b) return;
  //   ta.value = EXAMPLES[b.dataset.i][1]; count(); analyze();
  // });
  // Remove the example suggestion chips from the interface.
  $('#chips')?.remove();

  function count() { $('#count').textContent = `${ta.value.length} / 2000`; }
  ta.addEventListener('input', () => { count(); gfx.energy(.28); errEl.hidden = true; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); analyze(); } });
  go.addEventListener('click', analyze);

  function setAccent(name) {
    document.documentElement.style.setProperty('--a', (EMO[name] || EMO.neutral).c1);
  }

  async function analyze() {
    const text = ta.value.trim();
    if (!text) { errEl.textContent = 'Type a sentence first.'; errEl.hidden = false; ta.focus(); return; }
    errEl.hidden = true; go.classList.add('loading'); gfx.loading(true);
    try {
      const r = await fetch('/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(typeof j.detail === 'string' ? j.detail : 'The server could not read that text.');
      }
      show(await r.json());
    } catch (e) {
      errEl.textContent = e.message === 'Failed to fetch' ? 'Cannot reach the server. Check your connection and try again.' : e.message;
      errEl.hidden = false;
    } finally { go.classList.remove('loading'); gfx.loading(false); }
  }

  function show(data) {
    const emo = EMO[data.predicted_emotion] ? data.predicted_emotion : 'neutral';
    setAccent(emo); gfx.set(emo); fx(emo); rain(emo);

    $('#emoji').textContent = EMO[emo].emoji || '🙂';
    $('#label').textContent = emo;
    $('#conf').textContent = `${(data.confidence * 100).toFixed(1)}% confident`;
    const rows = ORDER.filter(k => k in data.all_probabilities).sort((a, b) => data.all_probabilities[b] - data.all_probabilities[a]);
    $('#bars').innerHTML = rows.map((k, i) => `
      <li class="${i === 0 ? 'top' : ''}"><span>${EMO[k].emoji}</span><span class="nm">${k}</span>
      <span class="tr"><span class="fl" style="--c:${EMO[k].c1}"></span></span>
      <span class="pc">${(data.all_probabilities[k] * 100).toFixed(1)}%</span></li>`).join('');
    res.hidden = false; res.classList.remove('in'); void res.offsetWidth; res.classList.add('in');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('#bars').querySelectorAll('.fl').forEach((el, i) => el.style.transform = `scaleX(${Math.max(.01, data.all_probabilities[rows[i]])})`);
    }));
    if (innerWidth < 860) res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* full-screen effect per emotion */
  function fx(emo) {
    if (RM) return;
    const cls = 'fx-' + emo;
    document.body.classList.remove('fx-anger', 'fx-fear', 'fx-love', 'fx-surprise');
    void document.body.offsetWidth;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), 1400);
  }

  /* 3D emoji drifting across the screen */
  function rain(emo) {
    if (RM) return;
    const e = EMO[emo]; if (!e.emoji) return;
    const W = innerWidth, H = innerHeight, wide = W / H > 1.05;
    const cx = wide ? W * .68 : W * .5, cy = wide ? H * .5 : H * .3;
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span');
      s.className = 'fl3d'; s.textContent = e.emoji;
      s.style.fontSize = (20 + Math.random() * 30) + 'px';
      document.body.appendChild(s);
      let x0 = Math.random() * W, y0, x1 = x0 + (Math.random() - .5) * 160, y1;
      if (e.dir === 1) { y0 = H + 40; y1 = -80; }
      else if (e.dir === -1) { y0 = -60; y1 = H + 60; }
      else if (e.dir === 'out') { x0 = cx; y0 = cy; const a = Math.random() * 6.283, r = 300 + Math.random() * 500; x1 = cx + Math.cos(a) * r; y1 = cy + Math.sin(a) * r; }
      else { y0 = Math.random() * H; y1 = y0 + (Math.random() - .5) * 60; x1 = x0 + (Math.random() - .5) * 40; }
      const z1 = Math.random() * 260 - 60;
      const fear = e.dir === 0;
      s.animate([
        { transform: `perspective(700px) translate3d(${x0}px,${y0}px,0) rotateY(0) rotateX(0) scale(.5)`, opacity: 0 },
        { opacity: fear ? .9 : 1, offset: .15 },
        { opacity: fear ? 0 : .9, offset: fear ? .35 : .7 },
        { transform: `perspective(700px) translate3d(${x1}px,${y1}px,${z1}px) rotateY(${Math.random() * 720}deg) rotateX(${Math.random() * 300}deg) scale(1)`, opacity: 0 },
      ], { duration: fear ? 900 + Math.random() * 600 : 2200 + Math.random() * 1800, delay: Math.random() * 450, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' }).onfinish = () => s.remove();
    }
  }

  /* 3D tilt on the result card */
  res.addEventListener('pointermove', e => {
    const r = res.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    res.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  });
  res.addEventListener('pointerleave', () => res.style.transform = '');

  /* server status (Render free instances sleep, so poll until the model is ready) */
  let tries = 0;
  (function poll() {
    fetch('/health').then(r => r.json()).then(h => {
      if (h.model_loaded) { statusEl.className = 'status ok'; statusEl.querySelector('b').textContent = 'model ready'; }
      else if (++tries < 40) { setTimeout(poll, 2500); }
    }).catch(() => {
      if (++tries < 40) setTimeout(poll, 3000);
      else { statusEl.className = 'status bad'; statusEl.querySelector('b').textContent = 'server unreachable'; }
    });
  })();
})();
