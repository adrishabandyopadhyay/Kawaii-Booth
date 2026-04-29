/* ═══════════════════════════════════════════
   KAWAII-BOOTH — app.js
   ═══════════════════════════════════════════ */

/* ── PARTICLES ── */
(() => {
  const em = ['🌸', '💕', '⭐', '✨', '🎀', '🌺', '💫', '🌷'];
  const w = document.getElementById('particles');
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'pt';
    p.textContent = em[i % em.length];
    p.style.cssText = `left:${Math.random() * 100}%;font-size:${.7 + Math.random() * 1.1}rem;animation-duration:${11 + Math.random() * 17}s;animation-delay:${-Math.random() * 22}s;`;
    w.appendChild(p);
  }
})();

/* ── UTILS ── */
const $ = id => document.getElementById(id);

/* ── TOAST ── */
let tt;
function showToast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════════════════════════════
   PHOTO STATE
   Each photo object:
     d         – original dataURL (never modified)
     rot       – rotation in degrees (0, 90, 180, 270)
     bright    – brightness % (100 = normal)
     contrast  – contrast %
     sat       – saturation %
     fit       – 'cover' | 'contain'
     panX, panY– normalized pan 0..1  (0.5,0.5 = centered)
     preview   – composited dataURL used in thumbs + sheet preview
═══════════════════════════════════════════════════════════ */
let photos = [];
let curLay = '2v';

/* ── FILTER STRING HELPER ── */
function fstr(b, c, s) {
  const p = [];
  if (b !== 100) p.push(`brightness(${b}%)`);
  if (c !== 100) p.push(`contrast(${c}%)`);
  if (s !== 100) p.push(`saturate(${s}%)`);
  return p.join(' ') || 'none';
}

/* ═══════════════════════════════════════════════════════════
   COMPOSITE ENGINE
   Draws a photo onto a canvas of size (outW × outH),
   honouring rot / fit / panX,panY / filters.

   KEY INSIGHT for cover+pan:
     1. Scale image so it fills the output (whichever axis).
     2. The excess overshoot gives us the pan range.
     3. panX/panY (0..1) map linearly into that range.
     4. Draw image at computed position, then rotate the
        whole canvas around its centre.
═══════════════════════════════════════════════════════════ */
function drawPhoto(ctx, img, outW, outH, rot, fit, panX, panY, bright, contrast, sat) {
  ctx.clearRect(0, 0, outW, outH);
  ctx.save();

  if (fit === 'contain') {
    ctx.filter = fstr(bright, contrast, sat);
    const ia = img.width / img.height;
    const sa = outW / outH;
    let dw, dh;
    if (ia > sa) { dw = outW; dh = outW / ia; }
    else { dh = outH; dw = outH * ia; }
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    /* COVER + PAN
       Step 1: draw panned+scaled image onto a temp canvas (image-space, no rotation).
       Step 2: rotate the output canvas, stamp the temp canvas onto it.
       This ensures pan offset is always measured in image-space,
       not in the rotated canvas-space — which caused the wrong position bug. */
    const ia = img.width / img.height;
    const sa = outW / outH;
    let scale;
    if (ia > sa) scale = outH / img.height;
    else scale = outW / img.width;

    const sw = img.width * scale;
    const sh = img.height * scale;
    const overX = Math.max(0, sw - outW);
    const overY = Math.max(0, sh - outH);

    /* pan: 0=top/left edge visible, 0.5=centre, 1=bottom/right edge */
    const ox = (outW - sw) / 2 - (panX - 0.5) * overX;
    const oy = (outH - sh) / 2 - (panY - 0.5) * overY;

    /* bake pan + filter into temp canvas */
    const tmp = document.createElement('canvas');
    tmp.width = outW; tmp.height = outH;
    const tc = tmp.getContext('2d');
    tc.filter = fstr(bright, contrast, sat);
    tc.drawImage(img, ox, oy, sw, sh);

    /* stamp rotated onto output */
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.filter = 'none';
    ctx.drawImage(tmp, -outW / 2, -outH / 2);
  }

  ctx.restore();
}

/* Build composite dataURL at given pixel size */
function composite(photo, outW, outH) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = outW; cv.height = outH;
      drawPhoto(cv.getContext('2d'), img, outW, outH,
        photo.rot, photo.fit, photo.panX, photo.panY,
        photo.bright, photo.contrast, photo.sat);
      res(cv.toDataURL('image/jpeg', 0.93));
    };
    img.src = photo.d;
  });
}

async function rebuildPreview(i) {
  photos[i].preview = await composite(photos[i], 600, 600);
}

/* ═══════════════ STEPS ═══════════════ */
function setActiveStep(i) {
  ['sc1', 'sc2', 'sc3'].forEach((id, j) => $(id).classList.toggle('act', j === i));
}

function jumpTo(id, idx) {
  if (idx >= 1 && !photos.length) {
    showToast('🌸 Upload photos first!');
    $('secUpload').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveStep(0);
    return;
  }
  $(id).classList.remove('hidden');
  $(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveStep(idx);
}

/* ═══════════════ UPLOAD ═══════════════ */
function triggerFile() { $('fi').click(); }

$('fi').addEventListener('change', function () {
  loadFiles([...this.files]);
  this.value = '';
});

const dz = $('dz');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); });
dz.addEventListener('dragleave', () => dz.classList.remove('on'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('on');
  loadFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
});

function loadFiles(files) {
  if (!files.length) return;
  let done = 0;
  const total = files.length;
  files.forEach(f => {
    const r = new FileReader();
    r.onload = async e => {
      const ph = { d: e.target.result, rot: 0, bright: 100, contrast: 100, sat: 100, fit: 'cover', panX: .5, panY: .5, preview: null };
      ph.preview = await composite(ph, 460, 260);
      photos.push(ph);
      if (++done === total) {
        renderAll();
        showToast(`💕 ${total} photo${total > 1 ? 's' : ''} added!`);
      }
    };
    r.readAsDataURL(f);
  });
}

function clearPhotos() {
  photos = [];
  $('secLayout').classList.add('hidden');
  $('secPreview').classList.add('hidden');
  setActiveStep(0);
  showToast('🌸 Cleared!');
}

function removePhoto(i) {
  photos.splice(i, 1);
  if (!photos.length) { clearPhotos(); return; }
  renderAll();
}

function setLayout(el) {
  document.querySelectorAll('.lp-btn').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
  curLay = el.dataset.l;
  renderSheets();
}

function pps() { return { 1: 1, '2v': 2, '2h': 2, '3': 3, '4': 4 }[curLay] || 2; }

function renderAll() {
  const has = photos.length > 0;
  $('secLayout').classList.toggle('hidden', !has);
  $('secPreview').classList.toggle('hidden', !has);
  $('cntB').textContent = photos.length + ' photo' + (photos.length !== 1 ? 's' : '');
  if (has) setActiveStep(1);
  renderThumbs();
  renderSheets();
}

/* ═══════════════ THUMBNAILS ═══════════════ */
let dragSrc = -1;

function renderThumbs() {
  const g = $('tgrid');
  g.innerHTML = '';
  photos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'ti';
    d.draggable = true;
    d.dataset.idx = i;
    d.innerHTML =
      `<img src="${p.preview || p.d}" alt=""/>` +
      `<span class="ti-n">#${i + 1}</span>` +
      `<button class="ti-rm" onclick="removePhoto(${i})">✕</button>` +
      `<div class="ti-bar">` +
      `<button class="ti-btn" onclick="openEditor(${i})">✏️</button>` +
      `<button class="ti-btn" onclick="quickRotate(${i},-90)">↺</button>` +
      `<button class="ti-btn" onclick="quickRotate(${i},90)">↻</button>` +
      `</div>`;
    d.addEventListener('dragstart', e => {
      dragSrc = i;
      d.classList.add('dragging-src');
      e.dataTransfer.effectAllowed = 'move';
    });
    d.addEventListener('dragend', () => {
      d.classList.remove('dragging-src');
      document.querySelectorAll('.ti').forEach(t => t.classList.remove('drag-over'));
    });
    d.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.ti').forEach(t => t.classList.remove('drag-over'));
      d.classList.add('drag-over');
    });
    d.addEventListener('drop', e => {
      e.preventDefault();
      const ti = parseInt(d.dataset.idx);
      if (dragSrc !== ti) {
        const m = photos.splice(dragSrc, 1)[0];
        photos.splice(ti, 0, m);
        renderAll();
        showToast('🌸 Reordered!');
      }
    });
    g.appendChild(d);
  });
}

async function quickRotate(i, deg) {
  photos[i].rot = (photos[i].rot + deg + 360) % 360;
  await rebuildPreview(i);
  renderAll();
}

/* ═══════════════ SHEET PREVIEW ═══════════════ */
function renderSheets() {
  if (!photos.length) return;
  const wrap = $('sheetsRow');
  wrap.innerHTML = '';
  const pp = pps(), deco = $('selDeco').value, crn = $('selCrn').value;
  const total = Math.ceil(photos.length / pp);

  for (let s = 0; s < total; s++) {
    const outer = document.createElement('div');
    outer.className = 'sw';

    const lbl = document.createElement('div');
    lbl.className = 'sw-lbl';
    lbl.textContent = `Sheet ${s + 1}/${total}`;
    outer.appendChild(lbl);

    const a4 = document.createElement('div');
    a4.className = `a4 lay${curLay}`;
    if (deco) a4.classList.add(deco);

    for (let i = 0; i < pp; i++) {
      const slot = document.createElement('div');
      const idx = s * pp + i;
      if (idx < photos.length) {
        slot.className = 'ps';
        const img = document.createElement('img');
        img.src = photos[idx].preview || photos[idx].d;
        slot.appendChild(img);
        const hint = document.createElement('div');
        hint.className = 'ps-hint';
        hint.textContent = '✏️ Edit';
        hint.onclick = (ci => () => openEditor(ci))(idx);
        slot.appendChild(hint);
      } else {
        slot.className = 'ps ep';
      }
      a4.appendChild(slot);
    }

    if (crn) {
      ['tl', 'tr', 'bl', 'br'].forEach(pos => {
        const c = document.createElement('span');
        c.className = `crd ${pos}`;
        c.textContent = crn;
        a4.appendChild(c);
      });
    }

    outer.appendChild(a4);
    wrap.appendChild(outer);
  }
}

/* ═══════════════════════════════════════════════════
   EDITOR
   Uses a canvas to draw the live preview.
   Pan is stored as normalized panX/panY (0..1).
   Dragging updates panX/Y and redraws the canvas —
   the exact same drawPhoto() used for composite().
   So preview = exactly what you'll get.
═══════════════════════════════════════════════════ */
let editIdx = -1;
let eRot, eBright, eContrast, eSat, eFit, ePanX, ePanY;
let eImg = null;

/* Canvas dims */
const CW = 460, CH = 260;

/* Pan drag state */
let panning = false, px0 = 0, py0 = 0, panX0 = 0, panY0 = 0;

function edRedraw() {
  if (!eImg || !eImg.complete) return;
  const cv = $('edCanvas');
  cv.width = CW; cv.height = CH;
  drawPhoto(cv.getContext('2d'), eImg, CW, CH, eRot, eFit, ePanX, ePanY, eBright, eContrast, eSat);
}

function updateFitUI() {
  $('btnCover').classList.toggle('on', eFit === 'cover');
  $('btnContain').classList.toggle('on', eFit === 'contain');
  const frame = $('cropFrame');
  frame.classList.toggle('can-pan', eFit === 'cover');
  $('cropHelp').textContent = eFit === 'cover' ? '🌸 Drag the image to pick exactly which part you want' : '';
}

function openEditor(i) {
  editIdx = i;
  const p = photos[i];
  eRot = p.rot; eBright = p.bright; eContrast = p.contrast; eSat = p.sat;
  eFit = p.fit; ePanX = p.panX; ePanY = p.panY;

  $('edNum').textContent = `#${i + 1}`;
  $('slB').value = eBright; $('vB').textContent = eBright + '%';
  $('slC').value = eContrast; $('vC').textContent = eContrast + '%';
  $('slS').value = eSat; $('vS').textContent = eSat + '%';
  updateFitUI();

  eImg = new Image();
  eImg.onload = () => edRedraw();
  eImg.src = p.d;

  $('edOv').classList.add('open');
}

function closeEditor() {
  $('edOv').classList.remove('open');
  editIdx = -1;
  panning = false;
}

$('edOv').addEventListener('click', e => { if (e.target === $('edOv')) closeEditor(); });

/* ── PAN DRAG on canvas ── */
const cropFrame = $('cropFrame');

function panStart(cx, cy) {
  if (eFit !== 'cover') return;
  panning = true; px0 = cx; py0 = cy; panX0 = ePanX; panY0 = ePanY;
  cropFrame.classList.add('panning');
}

function panMove(cx, cy) {
  if (!panning || !eImg) return;

  /* scale image to fill canvas */
  const rotated = (eRot % 180 !== 0);
  const imgW = rotated ? eImg.height : eImg.width;
  const imgH = rotated ? eImg.width : eImg.height;
  const ia = imgW / imgH;
  const sa = CW / CH;

  let scale;
  if (ia > sa) scale = CH / imgH;
  else scale = CW / imgW;

  const sw = imgW * scale;
  const sh = imgH * scale;
  const overX = Math.max(0, sw - CW), overY = Math.max(0, sh - CH);

  /* convert screen-pixel drag to canvas-pixel drag
     (canvas may be CSS-scaled to fit the frame width) */
  const cv = $('edCanvas');
  const rect = cv.getBoundingClientRect();
  const scaleX = CW / rect.width, scaleY = CH / rect.height;
  const ddx = (cx - px0) * scaleX;
  const ddy = (cy - py0) * scaleY;

  /* dragging right = shifting image left = panning right (panX increases) */
  if (overX > 0) {
    ePanX = Math.max(0, Math.min(1, panX0 + ddx / overX));
  } else {
    ePanX = 0.5;
  }

  if (overY > 0) {
    ePanY = Math.max(0, Math.min(1, panY0 + ddy / overY));
  } else {
    ePanY = 0.5;
  }

  edRedraw();
}

function panEnd() {
  panning = false;
  cropFrame.classList.remove('panning');
}

cropFrame.addEventListener('mousedown', e => { panStart(e.clientX, e.clientY); e.preventDefault(); });
window.addEventListener('mousemove', e => { panMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', panEnd);
cropFrame.addEventListener('touchstart', e => { panStart(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
window.addEventListener('touchmove', e => { if (panning) { panMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
window.addEventListener('touchend', panEnd);

function edRotate(deg) { eRot = (eRot + deg + 360) % 360; edRedraw(); }
function edSetFit(mode) { eFit = mode; updateFitUI(); edRedraw(); }

function edAdjust() {
  eBright = +$('slB').value; $('vB').textContent = eBright + '%';
  eContrast = +$('slC').value; $('vC').textContent = eContrast + '%';
  eSat = +$('slS').value; $('vS').textContent = eSat + '%';
  edRedraw();
}

function edReset() {
  eRot = 0; eBright = 100; eContrast = 100; eSat = 100; eFit = 'cover'; ePanX = .5; ePanY = .5;
  $('slB').value = 100; $('vB').textContent = '100%';
  $('slC').value = 100; $('vC').textContent = '100%';
  $('slS').value = 100; $('vS').textContent = '100%';
  updateFitUI(); edRedraw();
}

async function edApply() {
  if (editIdx < 0) return;
  const p = photos[editIdx];
  /* 1. save all edits to the photo object */
  p.rot = eRot; p.bright = eBright; p.contrast = eContrast; p.sat = eSat;
  p.fit = eFit; p.panX = ePanX; p.panY = ePanY;
  /* 2. close modal first so user sees progress */
  closeEditor();
  showToast('⏳ Rebuilding preview…');
  /* 3. wait for composite to fully resolve */
  const newPreview = await composite(p, 460, 260);
  p.preview = newPreview;
  /* 4. now re-render everything */
  renderThumbs();
  renderSheets();
  showToast('💕 Changes applied!');
}

/* ═══════════════ PDF GENERATION ═══════════════ */
async function generatePDF() {
  if (!photos.length) { showToast('🌸 Upload photos first!'); return; }

  const prog = $('progWrap'), fill = $('progFill'), lbl = $('progLbl');
  prog.classList.add('on');
  fill.style.width = '0%';
  setActiveStep(2);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const mg = parseInt($('selMarg').value) || 8;
  const pp = pps(), W = 210, H = 297, iW = W - 2 * mg, iH = H - 2 * mg;
  const deco = $('selDeco').value;

  function slots() {
    if (curLay === '1') return [[mg, mg, iW, iH]];
    if (curLay === '2v') { const h = (iH - mg) / 2; return [[mg, mg, iW, h], [mg, mg + h + mg, iW, h]]; }
    if (curLay === '2h') { const w = (iW - mg) / 2; return [[mg, mg, w, iH], [mg + w + mg, mg, w, iH]]; }
    if (curLay === '3')  { const th = (iH - mg) / 2, tw = (iW - mg) / 2; return [[mg, mg, iW, th], [mg, mg + th + mg, tw, th], [mg + tw + mg, mg + th + mg, tw, th]]; }
    if (curLay === '4')  { const hw = (iW - mg) / 2, hh = (iH - mg) / 2; return [[mg, mg, hw, hh], [mg + hw + mg, mg, hw, hh], [mg, mg + hh + mg, hw, hh], [mg + hw + mg, mg + hh + mg, hw, hh]]; }
    return [];
  }

  const total = Math.ceil(photos.length / pp);

  for (let s = 0; s < total; s++) {
    if (s > 0) pdf.addPage();

    if (deco) {
      if (deco === 'dh') pdf.setDrawColor(255, 200, 40);
      else if (deco === 'dh2') pdf.setDrawColor(255, 133, 161);
      else pdf.setDrawColor(170, 120, 255);
      pdf.setLineWidth(.7); pdf.rect(3.5, 3.5, 203, 290);
      pdf.setLineWidth(.3); pdf.rect(5, 5, 200, 287);
    }

    const sl = slots(), si = s * pp;
    for (let i = 0; i < pp; i++) {
      const idx = si + i;
      const [x, y, w, h] = sl[i];
      if (idx < photos.length) {
        const pxW = Math.round(w * 11.811), pxH = Math.round(h * 11.811);
        const url = await composite(photos[idx], pxW, pxH);
        pdf.addImage(url, 'JPEG', x, y, w, h, undefined, 'FAST');
        pdf.setDrawColor(220, 200, 245); pdf.setLineWidth(.2); pdf.rect(x, y, w, h);
      } else {
        pdf.setFillColor(248, 244, 255); pdf.rect(x, y, w, h, 'F');
        pdf.setDrawColor(200, 185, 240); pdf.setLineWidth(.25);
        pdf.setLineDashPattern([2, 2], 0); pdf.rect(x, y, w, h, 'S'); pdf.setLineDashPattern([], 0);
      }
    }

    fill.style.width = ((s + 1) / total * 100) + '%';
    lbl.textContent = `Sheet ${s + 1}/${total}… 🌸`;
    await new Promise(r => setTimeout(r, 25));
  }

  fill.style.width = '100%';
  lbl.textContent = '✨ Done!';
  setTimeout(() => {
    pdf.save('Kawaii-Booth-Print.pdf');
    showToast('💕 PDF ready! Print at any photo shop! 🖨️');
    setTimeout(() => { prog.classList.remove('on'); fill.style.width = '0%'; }, 2500);
  }, 350);
}
