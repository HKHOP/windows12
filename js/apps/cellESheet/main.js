import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import ContextMenu from '../../modules/contextMenu.js';
import SystemConfig from '../../modules/systemConfig.js';
import SavePrompt from '../../modules/saveprompt.js';

const CellESheet = (() => {
  const APP_ID='cellESheet', DOCS=['/','users','default','Documents'];
  const icon=AppIcons.get(APP_ID)||`<svg viewBox="0 0 24 24"><rect x="3" y="2" width="18" height="20" rx="3" fill="#217346"/><path d="M7 7h10M7 11h10M7 15h10M11 5v14M15 5v14" stroke="white" stroke-width="1.4"/></svg>`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colName=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
  const theme=()=>SystemConfig.get('darkMode')?'dark':'light';
  function fresh(){return {name:'Book1',path:null,dirty:false,activeSheet:0,active:'A1',selection:{start:'A1',end:'A1'},clipboard:null,zoom:100,sheets:[{name:'Sheet1',cells:{}}]};}
  function refToRC(ref){const m=/^([A-Z]+)(\d+)$/i.exec(ref);if(!m)return null;let c=0;for(const x of m[1].toUpperCase())c=c*26+x.charCodeAt(0)-64;return {r:+m[2]-1,c:c-1};}
  function rcToRef(r,c){return colName(c)+(r+1)}
  function value(st,ref,seen=new Set()){const cell=st.sheets[st.activeSheet].cells[ref];if(!cell)return 0;const raw=cell.v??'';if(typeof raw==='number')return raw;if(!String(raw).startsWith('='))return isNaN(Number(raw))?raw:Number(raw);if(seen.has(ref))return '#CYCLE!';seen.add(ref);try{return formula(st,String(raw).slice(1),seen)}catch{return '#ERROR!'}}
  function formula(st,f,seen){let x=f.toUpperCase();
    x=x.replace(/\b(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+\d+):([A-Z]+\d+)\)/g,(_,fn,a,b)=>{const A=refToRC(a),B=refToRC(b),arr=[];for(let r=Math.min(A.r,B.r);r<=Math.max(A.r,B.r);r++)for(let c=Math.min(A.c,B.c);c<=Math.max(A.c,B.c);c++){const v=value(st,rcToRef(r,c),new Set(seen));if(typeof v==='number')arr.push(v)}return fn==='SUM'?arr.reduce((p,q)=>p+q,0):fn==='AVERAGE'?(arr.reduce((p,q)=>p+q,0)/(arr.length||1)):fn==='MIN'?Math.min(...arr,0):fn==='MAX'?Math.max(...arr,0):arr.length});
    x=x.replace(/\b([A-Z]+\d+)\b/g,(_,r)=>{const v=value(st,r,new Set(seen));return typeof v==='number'?v:0});
    if(!/^[0-9+\-*/()., %]+$/.test(x))throw 0; return Function('return ('+x+')')();}
  function content(){return `<div class="ce" data-theme="${theme()}"><style>
.ce{--bg:#f3f3f3;--s:#fff;--s2:#fafafa;--line:#d0d0d0;--text:#222;--muted:#666;--accent:#217346;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--text);font:13px 'Segoe UI',Arial}.ce[data-theme=dark]{--bg:#1f1f1f;--s:#292929;--s2:#242424;--line:#4a4a4a;--text:#f2f2f2;--muted:#aaa}.ce button,.ce input,.ce select{font:inherit}.ce-tabs{height:38px;display:flex;align-items:end;gap:2px;padding:0 8px;background:var(--s);border-bottom:1px solid var(--line)}.ce-tab{height:34px;border:0;background:transparent;color:var(--text);padding:0 13px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent}.ce-tab.active{color:var(--accent);border-color:var(--accent)}.ce-ribbon{height:102px;display:flex;overflow:auto;background:var(--s);border-bottom:1px solid var(--line);padding:4px}.ce-group{display:flex;gap:4px;align-items:center;border-right:1px solid var(--line);padding:4px 10px;position:relative;padding-bottom:20px}.ce-group:after{content:attr(data-label);position:absolute;bottom:2px;left:0;right:0;text-align:center;color:var(--muted);font-size:10px}.ce-btn{border:1px solid transparent;background:transparent;color:var(--text);min-width:42px;height:55px;border-radius:4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:3px}.ce-btn b{line-height:1}.ce-btn span{font-size:10px;line-height:1.05}.ce-btn:hover{background:color-mix(in srgb,var(--accent) 10%,transparent);border-color:var(--line)}.ce-btn b{display:block;font-size:18px}.ce-main{min-height:0;flex:1;display:flex;flex-direction:column}.ce-formula{height:34px;display:flex;align-items:center;gap:6px;background:var(--s);border-bottom:1px solid var(--line);padding:0 8px}.ce-name{width:70px;text-align:center;border:1px solid var(--line);background:var(--s2);color:var(--text);height:23px}.ce-fx{font-weight:700;color:var(--muted)}.ce-formula input{flex:1;height:23px;border:1px solid var(--line);background:var(--s2);color:var(--text);padding:0 7px}.ce-gridwrap{flex:1;min-height:0;overflow:auto;background:var(--s2)}table.ce-grid{border-collapse:collapse;table-layout:fixed;background:var(--s)}.ce-grid th{position:sticky;top:0;background:var(--s2);z-index:3;color:var(--muted);font-weight:600}.ce-grid .rowh{position:sticky;left:0;z-index:2;background:var(--s2);width:46px}.ce-grid th,.ce-grid td{border:1px solid var(--line);height:23px;min-width:95px;box-sizing:border-box}.ce-grid td{padding:0 5px;overflow:hidden;white-space:nowrap;cursor:cell}.ce-grid td.sel{outline:2px solid var(--accent);outline-offset:-2px;position:relative;z-index:1}.ce-grid td.editing{padding:0}.ce-grid td input{width:100%;height:100%;border:0;outline:0;background:transparent;color:var(--text);padding:0 5px;box-sizing:border-box}.ce-sheets{height:34px;background:var(--s);border-top:1px solid var(--line);display:flex;align-items:center;gap:3px;padding:0 7px}.ce-sheets [data-addsheet]{width:27px;height:27px;border:1px solid var(--line);background:var(--s2);color:var(--accent);border-radius:5px;cursor:pointer;display:grid;place-items:center;font-size:18px;font-weight:700;line-height:1}.ce-sheets [data-addsheet]:hover{background:color-mix(in srgb,var(--accent) 14%,var(--s2));border-color:var(--accent)}.ce-sheet{border:0;background:transparent;color:var(--text);height:25px;padding:0 12px;border-radius:3px;cursor:pointer}.ce-sheet.active{border-bottom:2px solid var(--accent);font-weight:700}.ce-status{height:24px;background:var(--s);border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;padding:0 9px;color:var(--muted);font-size:11px}</style>
<div class="ce-tabs">${['File','Home','Insert','Page Layout','Formulas','Data','Review','View','Help'].map((x,i)=>`<button class="ce-tab ${i===1?'active':''}" data-tab="${x}">${x}</button>`).join('')}</div>
<div class="ce-ribbon" data-ribbon></div><div class="ce-main"><div class="ce-formula"><input class="ce-name" title="Name box"><span class="ce-fx">fx</span><input class="ce-finput" placeholder="Enter a value or formula"></div><div class="ce-gridwrap"><table class="ce-grid"><thead><tr><th class="rowh"></th>${Array.from({length:26},(_,i)=>`<th>${colName(i)}</th>`).join('')}</tr></thead><tbody>${Array.from({length:100},(_,r)=>`<tr><th class="rowh">${r+1}</th>${Array.from({length:26},(_,c)=>`<td data-ref="${rcToRef(r,c)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div><div class="ce-sheets"><button class="ce-addsheet" data-addsheet title="New sheet">＋</button><div data-sheets></div></div><div class="ce-status"><span>Ready</span><span data-count>0 cells</span></div></div>`}
  function ribbon(root,st){
    const r=root.querySelector('[data-ribbon]');const tab=root.querySelector('.ce-tab.active')?.dataset.tab||'Home';
    const S={
      paste:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
      copy:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
      cut:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
      bold:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
      italic:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
      fill:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
      alignLeft:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`,
      alignCenter:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>`,
      alignRight:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
      wrap:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="11 15 8 18 11 21"/><path d="M3 18h4"/></svg>`,
      insert:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      del:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`,
      autoSum:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="8" y1="4" x2="4" y2="8"/><line x1="4" y1="8" x2="8" y2="12"/><line x1="16" y1="12" x2="20" y2="16"/><line x1="20" y1="16" x2="16" y2="20"/></svg>`,
      sort:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="M3 17l3 3 3-3"/><path d="M6 18V4"/></svg>`,
      filter:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
      refresh:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
      removeDupes:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/><rect x="3" y="3" width="18" height="18" rx="2" fill="none"/></svg>`,
      trace:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
      evaluate:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
      new:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
      save:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
      saveAs:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><path d="M12 11v6"/><path d="M9 14l3-3 3 3"/></svg>`,
      exportCsv:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
      print:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
      table:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
      chart:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      picture:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      link:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      portrait:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/></svg>`,
      landscape:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/></svg>`,
      zoomIn:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
      zoomOut:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
      zoomReset:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      comment:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      protect:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      check:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      gridlines:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
      help:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };
    const iconMap={Paste:S.paste,Copy:S.copy,Cut:S.cut,Bold:S.bold,Italic:S.italic,Fill:S.fill,Left:S.alignLeft,Center:S.alignCenter,Right:S.alignRight,Wrap:S.wrap,Insert:S.insert,Delete:S.del,AutoSum:S.autoSum,SUM:S.autoSum,AVERAGE:S.autoSum,MIN:S.autoSum,MAX:S.autoSum,COUNT:S.autoSum,Sort:S.sort,Filter:S.filter,Refresh:S.refresh,'Remove Duplicates':S.removeDupes,Trace:S.trace,Evaluate:S.evaluate,New:S.new,Save:S.save,'Save As':S.saveAs,'Export CSV':S.exportCsv,Print:S.print,Table:S.table,Chart:S.chart,Picture:S.picture,Link:S.link,Portrait:S.portrait,Landscape:S.landscape,'Zoom In':S.zoomIn,'Zoom Out':S.zoomOut,'100%':S.zoomReset,Comment:S.comment,'Protect Sheet':S.protect,'Workbook Check':S.check,Gridlines:S.gridlines,Help:S.help};
    const b=a=>`<button class="ce-btn" data-action="${a}">${iconMap[a]||'◈'}<span>${a}</span></button>`;
    const g=(label,...xs)=>`<div class="ce-group" data-label="${label}">${xs.map(b).join('')}</div>`;
    const maps={
      File:()=>g('Workbook','New','Save','Save As','Export CSV')+g('Output','Print'),
      Home:()=>g('Clipboard','Paste','Copy','Cut')+g('Font','Bold','Italic','Fill')+g('Alignment','Left','Center','Right','Wrap')+g('Cells','Insert','Delete')+g('Editing','AutoSum','Sort','Filter'),
      Insert:()=>g('Tables','Table')+g('Illustrations','Picture','Chart')+g('Links','Link')+g('Cells','Insert'),
      'Page Layout':()=>g('Page Setup','Portrait','Landscape','Print')+g('Zoom','Zoom In','Zoom Out'),
      Formulas:()=>g('Function Library','AutoSum','SUM','AVERAGE','MIN','MAX','COUNT')+g('Formula Auditing','Trace','Evaluate'),
      Data:()=>g('Get & Transform','Refresh')+g('Sort & Filter','Sort','Filter')+g('Data Tools','Remove Duplicates'),
      Review:()=>g('Proofing','Workbook Check')+g('Comments','Comment')+g('Protection','Protect Sheet'),
      View:()=>g('Show','Gridlines')+g('Zoom','Zoom In','Zoom Out','100%'),
      Help:()=>g('Cell ESheet','Help')
    };
    r.innerHTML=(maps[tab]||maps.Home)();r.querySelectorAll('[data-action]').forEach(bx=>bx.onclick=()=>action(root,st,bx.dataset.action));
  }
  function render(root,st){root.dataset.theme=theme();root.querySelector('.ce-name').value=st.active;const sheet=st.sheets[st.activeSheet];root.querySelectorAll('td[data-ref]').forEach(td=>{const ref=td.dataset.ref,cell=sheet.cells[ref],v=cell?cell.v:'';td.classList.toggle('sel',ref===st.active);td.style.display=cell?.hidden?'none':'';if(!td.classList.contains('editing')){td.textContent=v===''?'':String(v).startsWith('=')?String(value(st,ref)):v;Object.assign(td.style,cell?.style||{});if(cell?.hidden)td.style.display='none';}});root.querySelector('.ce-finput').value=sheet.cells[st.active]?.v??'';root.querySelector('[data-count]').textContent=Object.keys(sheet.cells).filter(k=>!sheet.cells[k]?.hidden).length+' cells';const sh=root.querySelector('[data-sheets]');sh.innerHTML=st.sheets.map((s,i)=>`<button class="ce-sheet ${i===st.activeSheet?'active':''}" data-i="${i}">${esc(s.name)}</button>`).join('');sh.querySelectorAll('button').forEach(b=>b.onclick=()=>{st.activeSheet=+b.dataset.i;render(root,st)});}
  function commit(root,st,ref,raw){const s=st.sheets[st.activeSheet];if(raw==='')delete s.cells[ref];else s.cells[ref]={v:raw};st.dirty=true;render(root,st);}
  async function action(root,st,a){
    const s=st.sheets[st.activeSheet];
    if(a==='AutoSum'||a==='SUM'||a==='AVERAGE'||a==='MIN'||a==='MAX'||a==='COUNT'){const rc=refToRC(st.active);const fn=a==='AutoSum'?'SUM':a;return commit(root,st,st.active,`=${fn}(${colName(rc.c)}1:${colName(rc.c)}${Math.max(1,rc.r)})`)}
    if(a==='Bold'||a==='Italic'||a==='Fill'){const td=root.querySelector(`td[data-ref="${st.active}"]`);if(a==='Bold')td.style.fontWeight=td.style.fontWeight==='700'?'':'700';if(a==='Italic')td.style.fontStyle=td.style.fontStyle==='italic'?'':'italic';if(a==='Fill')td.style.background=td.style.background?'':'rgba(33,115,70,.16)';s.cells[st.active]={...(s.cells[st.active]||{v:''}),style:{fontWeight:td.style.fontWeight,fontStyle:td.style.fontStyle,background:td.style.background}};st.dirty=true;return;}
    if(['Left','Center','Right'].includes(a)){const td=root.querySelector(`td[data-ref="${st.active}"]`);td.style.textAlign=a==='Left'?'left':a==='Center'?'center':'right';s.cells[st.active]={...(s.cells[st.active]||{v:''}),style:{...(s.cells[st.active]?.style||{}),textAlign:td.style.textAlign}};st.dirty=true;return;}
    if(a==='Wrap'){const td=root.querySelector(`td[data-ref="${st.active}"]`);td.style.whiteSpace=td.style.whiteSpace==='normal'?'nowrap':'normal';return;}
    if(a==='Copy'){st.clipboard=s.cells[st.active]?.v??'';try{await navigator.clipboard?.writeText(st.clipboard)}catch{}return;}
    if(a==='Cut'){st.clipboard=s.cells[st.active]?.v??'';commit(root,st,st.active,'');return;}
    if(a==='Paste'){let x='';try{x=await navigator.clipboard?.readText()||''}catch{};return commit(root,st,st.active,x||st.clipboard||'');}
    if(a==='Delete'){return commit(root,st,st.active,'');}
    if(a==='Insert'){const rc=refToRC(st.active);if(!rc)return;const sheet=s;for(let r=99;r>rc.r;r--)for(let c=0;c<26;c++){const from=rcToRef(r-1,c),to=rcToRef(r,c);if(sheet.cells[from])sheet.cells[to]=sheet.cells[from];else delete sheet.cells[to];}for(let c=0;c<26;c++)delete sheet.cells[rcToRef(rc.r,c)];st.dirty=true;render(root,st);return;}
    if(a==='Sort'){
      const dir=await Popup.pick('Sort','Sort column A:',['A → Z (Ascending)','Z → A (Descending)']);
      if(!dir)return;
      const asc=dir.includes('A → Z');
      const entries=Object.entries(s.cells).filter(([k,v])=>v?.v!==''&&v?.v!=null);
      const rc=entries.map(([k])=>refToRC(k)).filter(Boolean);
      if(!rc.length)return;
      const minR=Math.min(...rc.map(x=>x.r)),maxR=Math.max(...rc.map(x=>x.r)),minC=Math.min(...rc.map(x=>x.c)),maxC=Math.max(...rc.map(x=>x.c));
      const rows=[];
      for(let r=minR;r<=maxR;r++){const row={};for(let c=minC;c<=maxC;c++){const ref=rcToRef(r,c);row[c]=s.cells[ref]?{...s.cells[ref]}:{v:''};}rows.push(row);}
      rows.sort((a,b)=>{const va=String(a[minC]?.v??''),vb=String(b[minC]?.v??'');return asc?va.localeCompare(vb,{numeric:true}):vb.localeCompare(va,{numeric:true});});
      for(let r=minR;r<=maxR;r++){const row=rows[r-minR];for(let c=minC;c<=maxC;c++){const ref=rcToRef(r,c);if(Object.values(row[c]).every(v=>v===''))delete s.cells[ref];else s.cells[ref]=row[c];}}
      st.dirty=true;render(root,st);return;
    }
    if(a==='Filter'){
      const col=await Popup.pick('Filter','Filter by column:',['A','B','C','D','E','F','G','H']);
      if(!col)return;
      const colIdx=[...col].reduce((acc,ch)=>acc*26+ch.charCodeAt(0)-64,0)-1;
      const vals=new Set();
      Object.entries(s.cells).forEach(([k,v])=>{const rc=refToRC(k);if(rc&&rc.c===colIdx&&v?.v!=='')vals.add(String(v.v));});
      const chosen=await Popup.pick('Filter','Show rows where column '+col+' equals:',['(All)','...Clear filter',...[...vals].slice(0,20)]);
      if(!chosen||chosen==='(All)')return;
      if(chosen.includes('Clear')){Object.values(s.cells).forEach(c=>{if(c)delete c.hidden;});st.dirty=true;render(root,st);return;}
      Object.entries(s.cells).forEach(([k,v])=>{const rc=refToRC(k);if(rc&&rc.c===colIdx){const match=String(v?.v??'')===chosen;Object.keys(s.cells).forEach(ck=>{const cr=refToRC(ck);if(cr&&cr.r===rc.r)if(!match)s.cells[ck]={...(s.cells[ck]||{v:''}),hidden:true};else if(s.cells[ck])delete s.cells[ck].hidden;});}});
      st.dirty=true;render(root,st);return;
    }
    if(a==='Remove Duplicates'){const seen=new Set();Object.keys(s.cells).forEach(k=>{const c=s.cells[k];if(c?.hidden)return;const v=c?.v;if(v!==''&&v!=null){if(seen.has(v))delete s.cells[k];else seen.add(v);}});st.dirty=true;render(root,st);return;}
    if(a==='Refresh'){render(root,st);return;}
    if(a==='Save')return save(st,root,false);if(a==='Save As')return save(st,root,true);
    if(a==='New'){if(st.dirty&&!await Popup.confirm('New Workbook','Discard unsaved changes?'))return;const n=fresh();Object.assign(st,n);ribbon(root,st);render(root,st);return;}
    if(a==='Export CSV'){const used=Object.entries(s.cells).filter(([k,v])=>!v?.hidden).map(([k])=>refToRC(k)).filter(Boolean);if(!used.length)return Popup.warn('Export CSV','There are no cells to export.');const mr=Math.max(...used.map(x=>x.r)),mc=Math.max(...used.map(x=>x.c));const csv=Array.from({length:mr+1},(_,r)=>Array.from({length:mc+1},(_,c)=>{const v=String(value(st,rcToRef(r,c))||'');return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}).join(',')).join('\n');const q=await SavePrompt.show({defaultName:st.name+'.csv',defaultPath:DOCS,extensions:[{value:'csv',label:'CSV Spreadsheet'}],parentApp:APP_ID});if(q)FileSystem.createFile(q.path,q.fullName,csv,q.ext);return;}
    if(a==='Print'){const s=document.createElement('style');s.id='ce-print-style';s.textContent='@media print{body *{visibility:hidden!important}.ce,.ce *{visibility:visible!important}.ce{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:white!important;color:black!important}.ce-ribbon,.ce-tabs,.ce-status,.ce-sheets{display:none!important}.ce-gridwrap{overflow:visible!important}.ce-grid td,.ce-grid th{border-color:#ccc!important;color:#111!important}td[style*="background"]{background:rgba(200,200,200,.3)!important}}';document.head.appendChild(s);window.print();setTimeout(()=>s.remove(),1000);return;}
    if(a==='Gridlines'){root.querySelector('.ce-grid').classList.toggle('ce-no-grid');return;}
    if(a==='Zoom In'||a==='Zoom Out'||a==='100%'){st.zoom=a==='100%'?100:Math.max(60,Math.min(160,(st.zoom||100)+(a==='Zoom In'?10:-10)));root.querySelector('.ce-gridwrap').style.zoom=st.zoom/100;return;}
    if(a==='Comment'){const x=await Popup.textbox('Comment','Comment text:');if(x){s.cells[st.active]={...(s.cells[st.active]||{v:''}),comment:x};st.dirty=true;}return;}
    if(a==='Protect Sheet'){s.protected=!s.protected;return Popup.info('Protect Sheet',s.protected?'Sheet is now protected.':'Sheet is now unprotected.');}
    if(a==='Workbook Check'){const errs=[];Object.entries(s.cells).forEach(([k,v])=>{if(v?.v&&String(v.v).startsWith('=')){try{value(st,k)}catch{errs.push(k+': '+v.v);}}});return Popup.info('Workbook Check',errs.length?`Found ${errs.length} formula error(s):\n${errs.join('\n')}`:'No structural errors found.');}
    if(a==='Trace')return Popup.info('Trace Formula',`${st.active}: ${s.cells[st.active]?.v??''}`);
    if(a==='Evaluate')return Popup.info('Formula Evaluation',`${st.active} = ${value(st,st.active)}`);
    if(a==='Table'){
      const d=await Popup.forum('Insert Table',[{key:'rows',label:'Rows',type:'number',value:'4'},{key:'cols',label:'Columns',type:'number',value:'3'}]);
      if(!d)return;const rc=refToRC(st.active);if(!rc)return;
      const nr=Math.min(20,Math.max(1,Number(d.rows)||4)),nc=Math.min(10,Math.max(1,Number(d.cols)||3));
      for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){const ref=rcToRef(rc.r+r,rc.c+c);if(!s.cells[ref])s.cells[ref]={v:r===0?`Header ${c+1}`:''};}
      st.dirty=true;render(root,st);return;
    }
    if(a==='Picture'){const p=await Popup.textbox('Insert Picture','Enter image URL:');if(p){const td=root.querySelector(`td[data-ref="${st.active}"]`);if(td){const img=document.createElement('img');img.src=p;img.style.cssText='max-width:100%;max-height:60px;';td.textContent='';td.appendChild(img);}}return;}
    if(a==='Link'){const url=await Popup.textbox('Insert Link','Enter URL:');if(url){const td=root.querySelector(`td[data-ref="${st.active}"]`);if(td){td.innerHTML=`<a href="${esc(url)}" target="_blank" style="color:#0078D4;text-decoration:underline;">${esc(url)}</a>`;}}return;}
    if(a==='Chart'){
      const vals=Object.entries(s.cells).filter(([k,v])=>typeof v?.v==='number').slice(0,10);
      if(!vals.length)return Popup.info('Chart','Enter some numeric data first, then try again.');
      const max=Math.max(...vals.map(([,v])=>v));
      const bars=vals.map(([k,v])=>{const h=Math.round((v/max)*120);return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;"><div style="width:30px;height:${h}px;background:var(--accent,#217346);border-radius:3px 3px 0 0;"></div><span style="font-size:10px;color:var(--text)">${k}</span></div>`;}).join('');
      return Popup.info('Chart',`<div style="display:flex;align-items:end;gap:6px;height:140px;padding:8px 0;">${bars}</div>`);
    }
    if(a==='Help')return Popup.info('Cell ESheet Help','Ctrl+S save • Ctrl+Shift+S save as\nCtrl+C copy • Ctrl+V paste • F2 or double-click to edit\nDelete clears cell • Insert adds row above');
    return Popup.info(a,`The ${a} command is available in the Cell ESheet ribbon.`);
  }
  async function save(st,root,saveAs=false){let path=st.path;if(!path||saveAs){const r=await SavePrompt.show({defaultName:st.name+'.cesheet',defaultPath:DOCS,extensions:[{value:'cesheet',label:'Cell ESheet Workbook'},{value:'csv',label:'CSV Spreadsheet'},{value:'json',label:'JSON Workbook'}],parentApp:APP_ID});if(!r)return false;path=[...r.path,r.fullName];st.path=path;st.name=r.fullName.replace(/\.[^.]+$/,'')}const ext=(path.at(-1)||'').split('.').pop().toLowerCase();let data;if(ext==='csv'){const s=st.sheets[st.activeSheet];const used=Object.entries(s.cells).filter(([,v])=>!v?.hidden&&v?.v!==''&&v?.v!=null).map(([k])=>refToRC(k)).filter(Boolean);if(used.length){const mr=Math.max(...used.map(x=>x.r)),mc=Math.max(...used.map(x=>x.c));data=Array.from({length:mr+1},(_,r)=>Array.from({length:mc+1},(_,c)=>{const v=String(s.cells[rcToRef(r,c)]?.v??'');return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}).join(',')).join('\n');}else data='';}else{data=JSON.stringify({version:1,name:st.name,sheets:st.sheets},null,2);}const ok=FileSystem.itemExists(path)?FileSystem.writeFile(path,data):FileSystem.createFile(path.slice(0,-1),path.at(-1),data,ext);if(ok){st.dirty=false;render(root,st)}return ok;}
  function wire(win,st){const root=win.element.querySelector('.ce');ribbon(root,st);render(root,st);root.querySelectorAll('.ce-tab').forEach(b=>b.onclick=()=>{root.querySelectorAll('.ce-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');ribbon(root,st)});root.querySelectorAll('td[data-ref]').forEach(td=>{td.onclick=()=>{st.active=td.dataset.ref;render(root,st)};td.ondblclick=()=>{st.active=td.dataset.ref;td.classList.add('editing');const raw=st.sheets[st.activeSheet].cells[st.active]?.v??'';td.innerHTML=`<input value="${esc(raw)}">`;const i=td.firstChild;i.focus();i.select();const done=()=>{td.classList.remove('editing');commit(root,st,st.active,i.value)};i.onblur=done;i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done()}if(e.key==='Escape'){render(root,st)}};};td.oncontextmenu=e=>{e.preventDefault();ContextMenu.show(e.clientX,e.clientY,[{label:'Copy',shortcut:'Ctrl+C',action:()=>action(root,st,'Copy')},{label:'Paste',shortcut:'Ctrl+V',action:()=>action(root,st,'Paste')},'separator',{label:'Clear',action:()=>commit(root,st,td.dataset.ref,'')}]);};});root.querySelector('.ce-name').onkeydown=e=>{if(e.key==='Enter'&&refToRC(e.target.value.toUpperCase())){st.active=e.target.value.toUpperCase();render(root,st)}};root.querySelector('.ce-finput').onkeydown=e=>{if(e.key==='Enter')commit(root,st,st.active,e.target.value)};root.querySelector('[data-addsheet]').onclick=()=>{st.sheets.push({name:'Sheet'+(st.sheets.length+1),cells:{}});st.activeSheet=st.sheets.length-1;render(root,st)};root.addEventListener('keydown',async e=>{const k=e.key.toLowerCase();if(e.ctrlKey&&k==='s'){e.preventDefault();await save(st,root,e.shiftKey)}if(e.ctrlKey&&k==='c'){e.preventDefault();await action(root,st,'Copy')}if(e.ctrlKey&&k==='v'){e.preventDefault();await action(root,st,'Paste')}if(e.key==='F2'){e.preventDefault();root.querySelector(`td[data-ref=\"${st.active}\"]`)?.ondblclick?.()}if(e.key==='Delete'){e.preventDefault();commit(root,st,st.active,'')}});setInterval(()=>{if(win.element.isConnected)root.dataset.theme=theme()},700);}
  function launch(){const win=WindowManager.createWindow(APP_ID,'Cell ESheet',icon,content(),{width:1280,height:820,minWidth:760,minHeight:520});wire(win,fresh());}
  function open(path,contentText){
    const ext=(path.at(-1)||'').split('.').pop().toLowerCase();
    let st=fresh();
    if(ext==='csv'){
      const lines=contentText.split(/\r?\n/).filter(l=>l.length>0);
      lines.forEach((line,ri)=>{
        const cols=line.split(',');
        cols.forEach((val,ci)=>{
          const ref=rcToRef(ri,ci);
          const v=val.replace(/^"|"$/g,'').replace(/""/g,'"').trim();
          if(v!=='')st.sheets[0].cells[ref]={v:isNaN(Number(v))?v:Number(v)};
        });
      });
      st.name=(path.at(-1)||'Book1').replace(/\.[^.]+$/,'');
      st.path=path;
    }else{
      let d;try{d=JSON.parse(contentText)}catch{d=null}
      if(d?.sheets){st.name=d.name||'Workbook';st.sheets=d.sheets;st.path=path;}
    }
    const win=WindowManager.createWindow(APP_ID,'Cell ESheet',icon,content(),{width:1280,height:820,minWidth:760,minHeight:520});
    wire(win,st);
  }
  return {launch,open};
})();
export default CellESheet;
