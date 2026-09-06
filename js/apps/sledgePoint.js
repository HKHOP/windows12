import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';
import ContextMenu from '../modules/contextMenu.js';
import SystemConfig from '../modules/systemConfig.js';
import SavePrompt from '../modules/saveprompt.js';
import FileAssociations from '../modules/fileAssociations.js';

const SledgePoint = (() => {
    const APP_ID = 'sledgePoint';
    const DATA_PATH = ['/', 'system', 'programs data', APP_ID];
    const DEFAULT_DOC_PATH = ['/', 'users', 'default', 'Documents'];
    const icon = AppIcons.get(APP_ID);

    const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const deep = v => JSON.parse(JSON.stringify(v));

    function emptySlide() {
        return {
            id: uid(),
            title: '',
            background: null,
            transition: { type: 'fade', duration: 450 },
            elements: []
        };
    }

    function defaultDoc() {
        return {
            version: 1,
            name: 'Untitled Presentation',
            theme: 'auto',
            size: { width: 1280, height: 720 },
            slides: [emptySlide()],
            activeSlide: 0
        };
    }

    function getTheme() {
        return SystemConfig.get('darkMode') ? 'dark' : 'light';
    }

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], APP_ID);
        }
    }

    function getContent() {
        return `
<div class="sp-app" data-theme="${getTheme()}">
<style>
.sp-app{--bg:#f3f3f3;--surface:#fff;--surface2:#f8f8f8;--line:#d5d5d5;--text:#1f1f1f;--muted:#666;--accent:var(--sp-accent,#0f6cbd);--selection:#0f6cbd;--shadow:0 10px 28px rgba(0,0,0,.15);height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--text);font-family:Segoe UI,Arial,sans-serif}
.sp-app[data-theme="dark"]{--bg:#202020;--surface:#292929;--surface2:#252525;--line:#444;--text:#f4f4f4;--muted:#aaa;--accent:#4cc2ff;--selection:#4cc2ff;--shadow:0 10px 28px rgba(0,0,0,.5)}
.sp-tabs{height:38px;display:flex;align-items:end;gap:1px;padding:0 10px;background:var(--surface);border-bottom:1px solid var(--line);user-select:none}
.sp-tab{height:34px;padding:0 14px;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--text);font:600 13px Segoe UI;cursor:pointer}
.sp-tab:hover{background:rgba(127,127,127,.12)}.sp-tab.active{border-bottom-color:var(--accent);color:var(--accent)}
.sp-ribbon{min-height:96px;background:var(--surface);border-bottom:1px solid var(--line);display:flex;overflow:auto;padding:6px 8px;gap:8px}
.sp-group{min-width:max-content;padding:0 8px;border-right:1px solid var(--line);display:flex;align-items:center;gap:5px;position:relative}
.sp-group-label{position:absolute;bottom:0;left:0;right:0;text-align:center;color:var(--muted);font-size:10px;padding-bottom:1px}
.sp-btn{border:1px solid transparent;background:transparent;color:var(--text);border-radius:4px;min-width:44px;min-height:52px;padding:4px 6px;font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.sp-btn:hover{background:rgba(127,127,127,.12);border-color:rgba(127,127,127,.15)}.sp-btn .ico{font-size:22px;line-height:20px}
.sp-btn.small{min-width:30px;min-height:28px;flex-direction:row;font-size:12px}.sp-main{min-height:0;flex:1;display:flex}
.sp-slides{width:210px;min-width:130px;overflow:auto;background:var(--surface2);border-right:1px solid var(--line);padding:10px}
.sp-slide-thumb{display:flex;gap:7px;padding:6px;margin-bottom:7px;border-radius:4px;cursor:pointer}.sp-slide-thumb.active{background:color-mix(in srgb,var(--accent) 20%,transparent);outline:1px solid var(--accent)}
.sp-num{font-size:11px;color:var(--muted);padding-top:2px;width:18px;text-align:right}.sp-thumb-canvas{width:145px;aspect-ratio:16/9;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);position:relative;overflow:hidden;color:#111}
.sp-work{min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;background:var(--bg)}
.sp-canvas-wrap{min-height:0;flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:32px}
.sp-canvas{width:min(100%,960px);aspect-ratio:16/9;background:white;box-shadow:var(--shadow);position:relative;overflow:hidden;transform-origin:center center;color:#111;touch-action:none}
.sp-el{position:absolute;box-sizing:border-box;user-select:none;touch-action:none;transform-origin:center center}.sp-el.selected{outline:2px solid var(--selection)}.sp-el.selected .sp-handle{display:block}
.sp-text{padding:8px;min-width:20px;min-height:20px;cursor:text;white-space:pre-wrap;overflow:hidden}.sp-shape{display:flex;align-items:center;justify-content:center}.sp-image{width:100%;height:100%;object-fit:fill;display:block}.sp-table{width:100%;height:100%;border-collapse:collapse;background:white}.sp-table td{border:1px solid #777;padding:4px;min-width:20px;vertical-align:top}
.sp-handle{display:none;position:absolute;width:10px;height:10px;border:1px solid white;background:var(--selection);border-radius:50%;z-index:5}.sp-handle[data-h="nw"]{left:-6px;top:-6px}.sp-handle[data-h="ne"]{right:-6px;top:-6px}.sp-handle[data-h="sw"]{left:-6px;bottom:-6px}.sp-handle[data-h="se"]{right:-6px;bottom:-6px}.sp-rotate{display:none;position:absolute;left:50%;top:-28px;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:var(--selection);border:2px solid white;cursor:grab}.sp-selected-line{display:none;position:absolute;width:2px;height:16px;background:var(--selection);left:50%;top:-18px}
.sp-notes{height:90px;border-top:1px solid var(--line);padding:8px 12px;background:var(--surface);font-size:12px;color:var(--muted)}
.sp-status{height:26px;border-top:1px solid var(--line);background:var(--surface);display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:11px;color:var(--muted)}
.sp-menu{display:none}.sp-menu.active{display:flex}
.sp-present{position:fixed;inset:0;background:#000;z-index:999999;display:flex;align-items:center;justify-content:center}.sp-present-slide{width:100vw;height:100vh;max-width:177.777vh;max-height:56.25vw;position:relative;background:white;overflow:hidden}.sp-present-hint{position:fixed;bottom:16px;color:#ddd;font-size:12px}
.sp-color{width:34px;height:26px;padding:0;border:1px solid var(--line);background:transparent;border-radius:4px}.sp-input{width:56px;background:var(--surface2);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:4px}
@media(max-width:700px){.sp-slides{width:135px;padding:4px}.sp-thumb-canvas{width:92px}.sp-ribbon{min-height:76px}.sp-btn{min-width:38px;min-height:46px}.sp-btn .ico{font-size:18px}.sp-tabs{overflow:auto}.sp-tab{padding:0 9px}}
</style>
<div class="sp-tabs" data-role="tabs">
  ${['File','Home','Insert','Draw','Design','Transitions','Slide Show','View'].map((t,i)=>`<button class="sp-tab ${i===1?'active':''}" data-tab="${t}">${t}</button>`).join('')}
</div>
<div class="sp-ribbon" data-role="ribbon"></div>
<div class="sp-main">
  <aside class="sp-slides" data-role="slides"></aside>
  <section class="sp-work">
    <div class="sp-canvas-wrap"><div class="sp-canvas" data-role="canvas"></div></div>
    <div class="sp-notes">Click to add notes (speaker notes are not exported in all formats yet).</div>
    <div class="sp-status"><span data-role="status">Ready</span><span><button class="sp-btn small" data-action="zoomOut">−</button><span data-role="zoom">100%</span><button class="sp-btn small" data-action="zoomIn">+</button></span></div>
  </section>
</div>`;
    }

    function ribbon(state) {
        const g = (label, buttons) => `<div class="sp-group">${buttons}<span class="sp-group-label">${label}</span></div>`;
        const b = (action, iconText, label) => `<button class="sp-btn" data-action="${action}"><span class="ico">${iconText}</span><span>${label}</span></button>`;
        const active = state.tab;
        if (active === 'File') return [
            g('Presentation', b('new','＋','New')+b('open','📂','Open')+b('save','💾','Save')+b('export','⇩','Export')),
            g('Presentation', b('present','▶','Present'))
        ].join('');
        if (active === 'Insert') return [
            g('Slides', b('newSlide','＋','New Slide')+b('duplicateSlide','⧉','Duplicate')),
            g('Content', b('text','T','Text Box')+b('image','▣','Image')+b('table','▦','Table')),
            g('Shapes', b('rect','▭','Rectangle')+b('ellipse','◯','Ellipse')+b('triangle','△','Triangle')+b('line','╱','Line'))
        ].join('');
        if (active === 'Draw') return g('Ink', b('draw','✎','Pen')+b('eraser','⌫','Eraser')+`<label class="sp-btn"><span class="ico">🎨</span><span>Ink</span><input class="sp-color" data-role="inkColor" type="color" value="#222222"></label>`);
        if (active === 'Transitions') return g('Transition', ['fade','slide','zoom','none'].map(x=>b(`transition:${x}`, x==='fade'?'◌':x==='slide'?'⇢':x==='zoom'?'⊙':'—', x[0].toUpperCase()+x.slice(1))).join(''));
        if (active === 'Slide Show') return g('Show', b('present','▶','From Start')+b('presentCurrent','▸','Current Slide'));
        if (active === 'Design') return [
            g('Theme', b('lightCanvas','☀','Light Slide')+b('darkCanvas','◐','Dark Slide')),
            g('Background', `<label class="sp-btn"><span class="ico">▧</span><span>Color</span><input class="sp-color" data-role="bgColor" type="color" value="#ffffff"></label>`)
        ].join('');
        if (active === 'View') return g('View', b('toggleSlides','☷','Slides')+b('fit','⛶','Fit')+b('present','⛶','Full Screen'));
        return [
            g('Clipboard', b('duplicate','⧉','Duplicate')+b('delete','⌫','Delete')),
            g('Slides', b('newSlide','＋','New Slide')+b('duplicateSlide','⧉','Duplicate')),
            g('Insert', b('text','T','Text')+b('image','▣','Image')+b('table','▦','Table')+b('rect','▭','Shape')),
            g('Arrange', b('front','⇧','Bring Front')+b('back','⇩','Send Back')+b('rotateLeft','↶','Rotate')+b('rotateRight','↷','Rotate'))
        ].join('');
    }

    function addElement(state, type, props = {}) {
        const base = {
            id: uid(), type, x: 120, y: 100, w: 300, h: 110, rotate: 0,
            z: state.slide.elements.length + 1, style: { fill:'#e7f1fb', stroke:'#0f6cbd', color:'#111111', fontSize:32, lineWidth:3 }
        };
        let el = { ...base, ...props };
        if (type === 'text') el = { ...el, text: props.text ?? 'Text' };
        if (type === 'shape') el = { ...el, shape: props.shape ?? 'rect' };
        if (type === 'table') el = { ...el, rows: props.rows ?? 3, cols: props.cols ?? 3, cells: props.cells ?? Array.from({length:(props.rows??3)*(props.cols??3)}, ()=>'') };
        state.slide.elements.push(el);
        state.selected = el.id;
        state.dirty = true;
        renderAll(state);
        return el;
    }

    function selectedEl(state) { return state.slide.elements.find(e => e.id === state.selected) || null; }

    function renderThumb(state, slide, i) {
        const scale = 145 / state.doc.size.width;
        return `<div class="sp-slide-thumb ${i===state.doc.activeSlide?'active':''}" data-slide-index="${i}">
            <div class="sp-num">${i+1}</div><div class="sp-thumb-canvas">
              ${slide.elements.map(el => `<div style="position:absolute;left:${el.x*scale}px;top:${el.y*scale}px;width:${el.w*scale}px;height:${el.h*scale}px;transform:rotate(${el.rotate||0}deg);overflow:hidden;font-size:${Math.max(4,(el.style?.fontSize||20)*scale)}px;background:${el.type==='shape'?el.style?.fill:'transparent'};border:${el.type==='shape'?Math.max(1,(el.style?.lineWidth||1)*scale)+'px solid '+(el.style?.stroke||'#000'):'none'}">${el.type==='text'?esc(el.text):el.type==='table'?'▦':el.type==='image'?'▣':el.type==='path'?'✎':''}</div>`).join('')}
            </div></div>`;
    }

    function renderSlides(state) {
        state.slidesEl.innerHTML = state.doc.slides.map((s,i)=>renderThumb(state,s,i)).join('');
        state.slidesEl.querySelectorAll('.sp-slide-thumb').forEach(el => el.addEventListener('click', () => {
            state.doc.activeSlide = Number(el.dataset.slideIndex); state.selected = null; renderAll(state);
        }));
        state.slidesEl.querySelectorAll('.sp-slide-thumb').forEach(el => el.addEventListener('contextmenu', e => {
            e.preventDefault(); const idx=Number(el.dataset.slideIndex);
            ContextMenu.show(e.clientX,e.clientY,[
                {label:'New Slide',icon:'＋',action:()=>newSlide(state,idx+1)},
                {label:'Duplicate Slide',icon:'⧉',action:()=>duplicateSlide(state,idx)},
                {label:'Delete Slide',icon:'🗑',disabled:state.doc.slides.length===1,action:()=>deleteSlide(state,idx)}
            ]);
        }));
    }

    function elementHTML(el) {
        const common = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;z-index:${el.z};transform:rotate(${el.rotate||0}deg);`;
        if (el.type === 'text') return `<div class="sp-el sp-text" data-id="${el.id}" style="${common}color:${el.style.color};font-size:${el.style.fontSize}px">${esc(el.text)}</div>`;
        if (el.type === 'image') return `<div class="sp-el" data-id="${el.id}" style="${common}"><img class="sp-image" src="${el.src}"></div>`;
        if (el.type === 'shape') {
            let extra = `background:${el.style.fill};border:${el.style.lineWidth}px solid ${el.style.stroke};`;
            if (el.shape==='ellipse') extra += 'border-radius:50%;';
            if (el.shape==='triangle') extra = `width:0!important;height:0!important;background:transparent;border-left:${el.w/2}px solid transparent;border-right:${el.w/2}px solid transparent;border-bottom:${el.h}px solid ${el.style.fill};`;
            if (el.shape==='line') extra = `height:${el.style.lineWidth}px!important;background:${el.style.stroke};border:0;`;
            return `<div class="sp-el sp-shape" data-id="${el.id}" style="${common}${extra}"></div>`;
        }
        if (el.type === 'table') {
            const rows = Array.from({length:el.rows},(_,r)=>`<tr>${Array.from({length:el.cols},(_,c)=>`<td contenteditable="true" data-cell="${r*el.cols+c}">${esc(el.cells[r*el.cols+c]||'')}</td>`).join('')}</tr>`).join('');
            return `<div class="sp-el" data-id="${el.id}" style="${common}"><table class="sp-table">${rows}</table></div>`;
        }
        if (el.type === 'path') return `<svg class="sp-el" data-id="${el.id}" style="${common}" viewBox="0 0 ${el.w} ${el.h}" preserveAspectRatio="none"><path d="${el.d}" fill="none" stroke="${el.style.stroke}" stroke-width="${el.style.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return '';
    }

    function renderCanvas(state) {
        state.slide = state.doc.slides[state.doc.activeSlide];
        state.canvas.style.background = state.slide.background || '#fff';
        state.canvas.innerHTML = state.slide.elements.sort((a,b)=>a.z-b.z).map(elementHTML).join('');
        if (state.selected) {
            const target = state.canvas.querySelector(`[data-id="${state.selected}"]`);
            if (target) addSelectionUI(state,target);
        }
        state.canvas.querySelectorAll('.sp-text').forEach(el => {
            el.addEventListener('dblclick', () => el.contentEditable = 'true');
            el.addEventListener('input', () => { const e=state.slide.elements.find(x=>x.id===el.dataset.id); e.text=el.innerText; state.dirty=true; });
            el.addEventListener('blur', () => { el.contentEditable='false'; });
        });
        state.canvas.querySelectorAll('.sp-table td').forEach(td => td.addEventListener('input', () => {
            const holder = td.closest('[data-id]'); const e=state.slide.elements.find(x=>x.id===holder.dataset.id); e.cells[Number(td.dataset.cell)] = td.innerText; state.dirty=true;
        }));
        state.canvas.querySelectorAll('.sp-el').forEach(el => {
            el.addEventListener('pointerdown', ev => {
                if (state.tool === 'draw') return;
                if (ev.target.closest('td[contenteditable="true"]')) return;
                state.selected = el.dataset.id; renderCanvas(state); beginDrag(state, ev, el.dataset.id);
            });
        });
    }

    function addSelectionUI(state,target) {
        target.classList.add('selected');
        ['nw','ne','sw','se'].forEach(h => {
            const x=document.createElement('span'); x.className='sp-handle'; x.dataset.h=h; target.appendChild(x);
            x.addEventListener('pointerdown', e=>beginResize(state,e,target.dataset.id,h));
        });
        const line=document.createElement('span'); line.className='sp-selected-line'; target.appendChild(line);
        const rot=document.createElement('span'); rot.className='sp-rotate'; target.appendChild(rot);
        rot.addEventListener('pointerdown', e=>beginRotate(state,e,target.dataset.id));
    }

    function beginDrag(state, ev, id) {
        if (ev.button !== 0) return;
        const e = state.slide.elements.find(x=>x.id===id); const sx=ev.clientX,sy=ev.clientY, ox=e.x,oy=e.y;
        ev.currentTarget.setPointerCapture?.(ev.pointerId);
        const move = m => { e.x=ox+(m.clientX-sx)/state.scale; e.y=oy+(m.clientY-sy)/state.scale; renderCanvas(state); state.dirty=true; };
        const up = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); renderSlides(state); };
        window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
    }

    function beginResize(state, ev, id, h) {
        ev.stopPropagation(); const e=state.slide.elements.find(x=>x.id===id); const sx=ev.clientX,sy=ev.clientY,b=deep(e);
        const move=m=>{
            const dx=(m.clientX-sx)/state.scale, dy=(m.clientY-sy)/state.scale;
            if(h.includes('e')) e.w=Math.max(20,b.w+dx); else {e.w=Math.max(20,b.w-dx);e.x=b.x+(b.w-e.w);}
            if(h.includes('s')) e.h=Math.max(20,b.h+dy); else {e.h=Math.max(20,b.h-dy);e.y=b.y+(b.h-e.h);}
            renderCanvas(state);state.dirty=true;
        };
        const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);renderSlides(state);};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    }

    function beginRotate(state, ev, id) {
        ev.stopPropagation(); const e=state.slide.elements.find(x=>x.id===id); const rect=state.canvas.getBoundingClientRect();
        const move=m=>{const cx=rect.left+(e.x+e.w/2)*state.scale,cy=rect.top+(e.y+e.h/2)*state.scale;e.rotate=Math.round(Math.atan2(m.clientY-cy,m.clientX-cx)*180/Math.PI+90);renderCanvas(state);state.dirty=true;};
        const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);renderSlides(state);};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    }

    function renderAll(state) {
        state.ribbonEl.innerHTML=ribbon(state);
        renderSlides(state); renderCanvas(state);
        state.statusEl.textContent=state.dirty?'Unsaved changes':'Ready';
        state.zoomEl.textContent=`${Math.round(state.scale*100)}%`;
        wireRibbon(state);
    }

    function newSlide(state, at = state.doc.slides.length) {
        state.doc.slides.splice(at,0,emptySlide());state.doc.activeSlide=at;state.selected=null;state.dirty=true;renderAll(state);
    }
    function duplicateSlide(state, idx=state.doc.activeSlide) {
        const s=deep(state.doc.slides[idx]);s.id=uid();s.elements.forEach(e=>e.id=uid());state.doc.slides.splice(idx+1,0,s);state.doc.activeSlide=idx+1;state.dirty=true;renderAll(state);
    }
    function deleteSlide(state,idx=state.doc.activeSlide) {
        if(state.doc.slides.length===1)return;state.doc.slides.splice(idx,1);state.doc.activeSlide=Math.max(0,Math.min(idx,state.doc.slides.length-1));state.selected=null;state.dirty=true;renderAll(state);
    }

    function wireRibbon(state) {
        state.ribbonEl.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>action(state,btn.dataset.action)));
        const bg=state.ribbonEl.querySelector('[data-role="bgColor"]'); if(bg) bg.addEventListener('input',()=>{state.slide.background=bg.value;state.dirty=true;renderAll(state);});
        const ink=state.ribbonEl.querySelector('[data-role="inkColor"]'); if(ink) ink.addEventListener('input',()=>state.inkColor=ink.value);
    }

    async function action(state,a) {
        if(a==='new') { state.doc=defaultDoc();state.selected=null;state.dirty=false;renderAll(state);return; }
        if(a==='newSlide') return newSlide(state);
        if(a==='duplicateSlide') return duplicateSlide(state);
        if(a==='delete') { const e=selectedEl(state);if(e){state.slide.elements=state.slide.elements.filter(x=>x.id!==e.id);state.selected=null;state.dirty=true;renderAll(state);} return; }
        if(a==='duplicate') { const e=selectedEl(state);if(e){const n=deep(e);n.id=uid();n.x+=24;n.y+=24;n.z=state.slide.elements.length+1;state.slide.elements.push(n);state.selected=n.id;state.dirty=true;renderAll(state);} return; }
        if(a==='text') return addElement(state,'text');
        if(a==='rect') return addElement(state,'shape',{shape:'rect'});
        if(a==='ellipse') return addElement(state,'shape',{shape:'ellipse',w:180,h:180});
        if(a==='triangle') return addElement(state,'shape',{shape:'triangle',w:200,h:180});
        if(a==='line') return addElement(state,'shape',{shape:'line',w:250,h:4});
        if(a==='table') return addElement(state,'table');
        if(a==='draw') {state.tool='draw';state.statusEl.textContent='Draw mode';return;}
        if(a==='eraser') {state.tool='select';return;}
        if(a==='image') return insertImage(state);
        if(a==='front'||a==='back') {const e=selectedEl(state);if(e){e.z=a==='front'?Math.max(...state.slide.elements.map(x=>x.z))+1:0;state.dirty=true;renderAll(state);}return;}
        if(a==='rotateLeft'||a==='rotateRight'){const e=selectedEl(state);if(e){e.rotate=(e.rotate||0)+(a==='rotateLeft'?-15:15);state.dirty=true;renderAll(state);}return;}
        if(a==='zoomIn'){state.scale=Math.min(1.8,state.scale+.1);applyScale(state);return;}
        if(a==='zoomOut'){state.scale=Math.max(.4,state.scale-.1);applyScale(state);return;}
        if(a==='fit'){state.scale=1;applyScale(state);return;}
        if(a==='toggleSlides'){state.slidesEl.style.display=state.slidesEl.style.display==='none'?'block':'none';return;}
        if(a==='lightCanvas'){state.slide.background='#ffffff';state.dirty=true;renderAll(state);return;}
        if(a==='darkCanvas'){state.slide.background='#202020';state.dirty=true;renderAll(state);return;}
        if(a.startsWith('transition:')){state.slide.transition.type=a.split(':')[1];state.dirty=true;renderAll(state);return;}
        if(a==='save') return saveProject(state);
        if(a==='open') return openProject(state);
        if(a==='export') return exportProject(state);
        if(a==='present') return present(state,0);
        if(a==='presentCurrent') return present(state,state.doc.activeSlide);
    }

    function applyScale(state){state.canvas.style.transform=`scale(${state.scale})`;state.zoomEl.textContent=`${Math.round(state.scale*100)}%`;}

    async function insertImage(state) {
        const input=document.createElement('input');input.type='file';input.accept='image/*';
        input.onchange=()=>{const f=input.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>addElement(state,'image',{src:r.result,w:360,h:240});r.readAsDataURL(f);};input.click();
    }

    function bindDrawing(state) {
        let active=null;
        state.canvas.addEventListener('pointerdown', e=>{
            if(state.tool!=='draw') return;
            const r=state.canvas.getBoundingClientRect();const x=(e.clientX-r.left)/state.scale,y=(e.clientY-r.top)/state.scale;
            active={id:uid(),type:'path',x,y,w:1,h:1,rotate:0,z:state.slide.elements.length+1,style:{stroke:state.inkColor,lineWidth:4},points:[[x,y]]};state.slide.elements.push(active);state.selected=active.id;
        });
        state.canvas.addEventListener('pointermove', e=>{
            if(!active)return;const r=state.canvas.getBoundingClientRect();const x=(e.clientX-r.left)/state.scale,y=(e.clientY-r.top)/state.scale;active.points.push([x,y]);active.x=Math.min(...active.points.map(p=>p[0]));active.y=Math.min(...active.points.map(p=>p[1]));active.w=Math.max(1,Math.max(...active.points.map(p=>p[0]))-active.x);active.h=Math.max(1,Math.max(...active.points.map(p=>p[1]))-active.y);active.d=active.points.map((p,i)=>`${i?'L':'M'} ${p[0]-active.x} ${p[1]-active.y}`).join(' ');renderCanvas(state);state.dirty=true;
        });
        window.addEventListener('pointerup',()=>{if(active){renderSlides(state);active=null;}});
    }

    async function saveProject(state) {
        const result=await SavePrompt.show({defaultName:(state.doc.name||'Untitled Presentation')+'.sledge',defaultPath:DEFAULT_DOC_PATH,extensions:[{value:'sledge',label:'Sledge Point Presentation'}],parentApp:APP_ID});
        if(!result)return;
        FileSystem.createFile(result.path,result.fullName,JSON.stringify(state.doc,null,2),result.ext);
        state.filePath=[...result.path,result.fullName];state.doc.name=result.name||state.doc.name;state.dirty=false;renderAll(state);
    }

    async function openProject(state) {
        const pathText=await Popup.textbox('Open Presentation','Enter a virtual filesystem path, separated by /', {placeholder:'/users/default/Documents/presentation.sledge'});
        if(!pathText)return;
        const parts=pathText.split('/').filter(Boolean);const path=['/',...parts];const raw=FileSystem.readFile(path);
        if(!raw){await Popup.error('Open failed','The file could not be read.');return;}
        try{state.doc=JSON.parse(raw);state.doc.activeSlide=0;state.filePath=path;state.selected=null;state.dirty=false;renderAll(state);}catch{await Popup.error('Open failed','This is not a valid Sledge Point project.');}
    }

    function download(name,type,content) {
        const blob=content instanceof Blob?content:new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500);
    }

    function htmlExport(state) {
        const slideMarkup=state.doc.slides.map((s,i)=>`<section class="slide" style="display:${i?'none':'block'};background:${s.background||'#fff'}">${s.elements.map(exportElement).join('')}</section>`).join('');
        return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.doc.name)}</title><style>html,body{margin:0;height:100%;background:#000;font-family:Segoe UI,Arial}.slide{width:100vw;height:100vh;max-width:177.777vh;max-height:56.25vw;position:absolute;inset:0;margin:auto;overflow:hidden}.e{position:absolute;box-sizing:border-box}.text{white-space:pre-wrap}.shape.ellipse{border-radius:50%}table{border-collapse:collapse;width:100%;height:100%}td{border:1px solid #777;padding:4px}img{width:100%;height:100%;object-fit:fill}</style></head><body>${slideMarkup}<script>let i=0,s=[...document.querySelectorAll('.slide')];function go(n){s[i].style.display='none';i=(n+s.length)%s.length;s[i].style.display='block'}addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))go(i+1);if(['ArrowLeft','PageUp'].includes(e.key))go(i-1);if(e.key==='Escape')document.exitFullscreen?.()});document.body.onclick=()=>go(i+1)</script></body></html>`;
    }

    function exportElement(e) {
        const style=`left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;z-index:${e.z};transform:rotate(${e.rotate||0}deg);`;
        if(e.type==='text')return `<div class="e text" style="${style}color:${e.style.color};font-size:${e.style.fontSize}px;padding:8px">${esc(e.text)}</div>`;
        if(e.type==='image')return `<div class="e" style="${style}"><img src="${e.src}"></div>`;
        if(e.type==='shape'){let extra=`background:${e.style.fill};border:${e.style.lineWidth}px solid ${e.style.stroke};`;if(e.shape==='ellipse')extra+='border-radius:50%;';if(e.shape==='line')extra=`height:${e.style.lineWidth}px!important;background:${e.style.stroke};`;return `<div class="e shape ${e.shape}" style="${style}${extra}"></div>`;}
        if(e.type==='table'){return `<div class="e" style="${style}"><table>${Array.from({length:e.rows},(_,r)=>`<tr>${Array.from({length:e.cols},(_,c)=>`<td>${esc(e.cells[r*e.cols+c]||'')}</td>`).join('')}</tr>`).join('')}</table></div>`;}
        if(e.type==='path')return `<svg class="e" style="${style}" viewBox="0 0 ${e.w} ${e.h}" preserveAspectRatio="none"><path d="${e.d}" fill="none" stroke="${e.style.stroke}" stroke-width="${e.style.lineWidth}"/></svg>`;
        return '';
    }

    async function exportProject(state) {
        const fmt=await Popup.pick('Export Presentation','Choose an export format',[
            'HTML – interactive web presentation','PDF – print/export through browser','SVG – current slide','PNG – current slide image','JSON – portable project data','PPTX – requires an OOXML/ZIP export module','ODP – requires an OpenDocument ZIP export module','PPT – legacy binary format is not generated in-browser'
        ]);
        if(!fmt)return;
        if(fmt.startsWith('HTML')){download(`${state.doc.name}.html`,'text/html',htmlExport(state));return;}
        if(fmt.startsWith('JSON')){download(`${state.doc.name}.json`,'application/json',JSON.stringify(state.doc,null,2));return;}
        if(fmt.startsWith('PDF')){const w=window.open('','_blank');w.document.write(htmlExport(state));w.document.close();setTimeout(()=>w.print(),500);return;}
        if(fmt.startsWith('SVG')){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${state.doc.size.width}" height="${state.doc.size.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${state.doc.size.width}px;height:${state.doc.size.height}px;background:${state.slide.background||'#fff'}">${state.slide.elements.map(exportElement).join('')}</div></foreignObject></svg>`;download(`${state.doc.name}-slide-${state.doc.activeSlide+1}.svg`,'image/svg+xml',svg);return;}
        if(fmt.startsWith('PNG')){await Popup.warn('PNG export','PNG rendering needs a canvas rasterizer dependency. SVG export is available now and can be converted by compatible apps.');return;}
        await Popup.info('Export module needed',`${fmt.split(' – ')[0]} is intentionally not faked. Add a ZIP/package exporter (for example a project-approved JS module) to generate standards-compliant ${fmt.startsWith('PPTX')?'PPTX':'ODP'} files; legacy PPT requires a separate Compound File Binary implementation.`);
    }

    function cloneSlideDOM(state, index) {
        const s=state.doc.slides[index];const wrap=document.createElement('div');wrap.className='sp-present-slide';wrap.style.background=s.background||'#fff';wrap.innerHTML=s.elements.map(elementHTML).join('');return wrap;
    }

    function present(state,start=0) {
        let i=start;const root=document.createElement('div');root.className='sp-present';const hint=document.createElement('div');hint.className='sp-present-hint';hint.textContent='Click / → next • ← previous • Esc exit';root.append(hint);
        const show=()=>{root.querySelectorAll('.sp-present-slide').forEach(x=>x.remove());const slide=cloneSlideDOM(state,i);root.insertBefore(slide,hint);const t=state.doc.slides[i].transition?.type;if(t==='fade'){slide.animate([{opacity:0},{opacity:1}],{duration:state.doc.slides[i].transition.duration||450});}if(t==='zoom'){slide.animate([{transform:'scale(.94)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:state.doc.slides[i].transition.duration||450});}};
        const key=e=>{if(e.key==='Escape'){cleanup();return;}if(['ArrowRight','PageDown',' '].includes(e.key)){i=Math.min(state.doc.slides.length-1,i+1);show();}if(['ArrowLeft','PageUp'].includes(e.key)){i=Math.max(0,i-1);show();}};
        const click=()=>{if(i<state.doc.slides.length-1){i++;show();}else cleanup();};
        const cleanup=()=>{window.removeEventListener('keydown',key);root.remove();document.exitFullscreen?.();};
        root.addEventListener('click',click);window.addEventListener('keydown',key);document.body.append(root);show();root.requestFullscreen?.().catch(()=>{});
    }

    function launch() {
        const win=WindowManager.createWindow(APP_ID,'Sledge Point',icon,getContent(),{width:1280,height:820,minWidth:820,minHeight:560});
        const root=win.element.querySelector('.sp-app');
        const state={doc:defaultDoc(),slide:null,selected:null,tab:'Home',dirty:false,scale:1,tool:'select',inkColor:'#222',canvas:root.querySelector('[data-role="canvas"]'),slidesEl:root.querySelector('[data-role="slides"]'),ribbonEl:root.querySelector('[data-role="ribbon"]'),statusEl:root.querySelector('[data-role="status"]'),zoomEl:root.querySelector('[data-role="zoom"]')};
        root.style.setProperty('--sp-accent',SystemConfig.get('accentColor')||'#0f6cbd');
        root.querySelectorAll('.sp-tab').forEach(tab=>tab.addEventListener('click',()=>{root.querySelectorAll('.sp-tab').forEach(x=>x.classList.remove('active'));tab.classList.add('active');state.tab=tab.dataset.tab;renderAll(state);}));
        root.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>action(state,btn.dataset.action)));
        bindDrawing(state);
        renderAll(state);
        const observer=setInterval(()=>{if(!win.element.isConnected){clearInterval(observer);return;}const t=getTheme();if(root.dataset.theme!==t){root.dataset.theme=t;root.style.setProperty('--sp-accent',SystemConfig.get('accentColor')||'#0f6cbd');}},700);
    }

    function open(path,content) {
        const win=WindowManager.createWindow(APP_ID,'Sledge Point',icon,getContent(),{width:1280,height:820,minWidth:820,minHeight:560});
        // Re-launching through the normal path is safer for state wiring; this branch is reserved for associations.
        win.element.remove();
        launch();
    }

    FileAssociations.register(APP_ID,['sledge','sledgepoint'],open);
    return { launch, open };
})();

export default SledgePoint;
