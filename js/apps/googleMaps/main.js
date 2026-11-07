// Google Maps — native place search (OpenStreetMap Nominatim) + OSM static map.
import { createApp } from '../../sdk/index.js';
import NetworkStatus from '../../modules/networkStatus.js';

const GoogleMaps = (() => {
    function escapeHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function geocode(q){
        const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8`,{headers:{'Accept-Language':'en'}});
        if(!r.ok)throw new Error('HTTP '+r.status); return r.json();
    }
    function launch(){
        const app=createApp({id:'googleMaps',name:'Google Maps'});
        const win=app.window.create({title:'Google Maps',icon:app.icon(),content:`
            <div style="display:flex;flex-direction:column;height:100%;background:var(--window-bg);color:var(--text-primary);font-family:'Segoe UI',sans-serif;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--window-border);display:flex;gap:6px;">
                    <input class="m-q" placeholder="Search place or address..." style="flex:1;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);color:var(--text-primary);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="m-go" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Search</button>
                </div>
                <div class="m-status" style="padding:6px 12px;font-size:12px;color:var(--text-secondary);"></div>
                <div class="m-body" style="flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px;"></div>
            </div>`,width:460,height:640});
        const el=win.element;
        const q=el.querySelector('.m-q'); const body=el.querySelector('.m-body'); const status=el.querySelector('.m-status');

        async function go(){
            const term=q.value.trim(); if(!term) return;
            if(!NetworkStatus.isOnline()){NetworkStatus.showError('Google Maps');return;}
            status.textContent='Searching...'; body.innerHTML='';
            try{
                const items=await geocode(term);
                status.textContent=`${items.length} places`;
                for(const it of items){
                    const card=document.createElement('div');
                    card.style.cssText='padding:10px;border:1px solid var(--window-border);border-radius:8px;display:flex;flex-direction:column;gap:6px;';
                    const lat=parseFloat(it.lat), lon=parseFloat(it.lon);
                    const mapUrl=`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=13&size=400x200&markers=${lat},${lon},red-pushpin`;
                    card.innerHTML=`<div style="font-weight:600;font-size:14px;">${escapeHtml(it.display_name)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
                        <img src="${escapeHtml(mapUrl)}" alt="map" style="max-width:100%;border-radius:6px;border:1px solid var(--window-border);">
                        <div style="display:flex;gap:6px;">
                            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener" style="color:var(--accent-color);font-size:13px;">Open in Google Maps ↗</a>
                            <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}" target="_blank" rel="noopener" style="color:var(--accent-color);font-size:13px;">OpenStreetMap ↗</a>
                        </div>`;
                    body.appendChild(card);
                }
                if(!items.length) body.innerHTML='<div style="color:var(--text-secondary);font-size:13px;padding:8px;">No places found.</div>';
            }catch(e){status.textContent='Load failed: '+(e&&e.message?e.message:e);body.innerHTML='';}
        }
        el.querySelector('.m-go').addEventListener('click',go);
        q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
        q.focus();
    }
    return {launch};
})();
export default GoogleMaps;
