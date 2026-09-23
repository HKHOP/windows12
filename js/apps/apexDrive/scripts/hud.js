// Apex Drive 3D — HUD, minimap and result-panel helpers.
import { fmtTime, RACE_LAPS, HALF } from './util.js';

export function getHud(root) {
    const q = (s) => root.querySelector(s);
    return {
        hud: q('.ax-hud'), map: q('.ax-map'), mapCtx: q('.ax-map').getContext('2d'),
        speedV: q('.ax-speed .v'), gear: q('.ax-speed .gear'),
        boost: q('.ax-boost'), boostFill: q('.ax-boost > div'),
        pillA: q('.pill-a span'), pillB: q('.pill-b span'), pillC: q('.pill-c span'),
        pos: q('.ax-pos'), msg: q('.ax-msg'), sub: q('.ax-sub2'), warn: q('.ax-warn'),
        final: q('.ax-final')
    };
}

export function updateHud(H, S) {
    const p = S.player;
    const kmh = Math.round(p.speed * 3.6);
    H.speedV.textContent = kmh;
    const fwd = p.vx * Math.sin(p.heading) + p.vz * Math.cos(p.heading);
    H.gear.textContent = fwd < -0.5 ? 'R' : (p.boosting ? 'BOOST' : 'D');
    H.boostFill.style.width = p.boost.toFixed(0) + '%';
    H.boost.classList.toggle('low', p.boost < 25);
    if (S.mode === 'race') {
        H.pillA.textContent = Math.min(p.lap + 1, RACE_LAPS) + '/' + RACE_LAPS;
        H.pillB.textContent = fmtTime(S.race.timeMs);
        H.pillC.textContent = fmtTime(S.rec.bestLapMs);
        const order = [p, ...S.ais].map((c, i) => ({ c, i }))
            .sort((a, b) => (b.c.lap + b.c.frac) - (a.c.lap + a.c.frac));
        const place = order.findIndex(o => o.i === 0) + 1;
        const suffix = ['1st', '2nd', '3rd', '4th'][place - 1];
        H.pos.textContent = S.race.countdown > 0 ? '' : (S.finished ? 'FINISHED — ' + suffix : suffix + ' / 4');
    } else {
        H.pillA.textContent = S.roam.rings + ' rings';
        H.pillB.textContent = fmtTime(S.roam.timeMs);
        H.pillC.textContent = Math.round((S.rec.topSpeedKmh || 0)) + ' top';
    }
}

export function drawMinimap(H, S) {
    const ctx = H.mapCtx, W = 150;
    ctx.clearRect(0, 0, W, W);
    const toMap = (x, z) => [(x / HALF * 0.5 + 0.5) * W, (z / HALF * 0.5 + 0.5) * W];
    if (S.mode === 'race') {
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.beginPath();
        S.G.samples.forEach((s, i) => {
            const [mx, my] = toMap(s.x, s.z);
            if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
        });
        ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
        ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1;
        for (const r of S.G.rings) {
            if (r.taken > 0) continue;
            const [mx, my] = toMap(r.x, r.z);
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, 7); ctx.fill();
        }
    }
    const dot = (c, color, big) => {
        const [mx, my] = toMap(c.x, c.z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(mx, my, big ? 4 : 3, 0, 7); ctx.fill();
    };
    const aiCols = ['#60a5fa', '#4ade80', '#facc15'];
    S.ais.forEach((a, i) => dot(a, aiCols[i % 3], false));
    dot(S.player, '#ffffff', true);
    // player heading tick
    const [px, py] = toMap(S.player.x, S.player.z);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(S.player.heading) * 8, py + Math.cos(S.player.heading) * 8);
    ctx.stroke();
}

export function showFinal(H, rows, title, subtitle, onMenu, onRetry) {
    H.final.innerHTML =
        '<div class="ax-panel"><h2>' + title + '</h2><div class="t">' + subtitle + '</div>' +
        rows.map(r => '<div class="ax-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
        '<button class="f-retry">Drive Again</button><button class="f-menu ghost">Menu</button></div>';
    H.final.classList.add('on');
    H.final.querySelector('.f-menu').addEventListener('click', onMenu);
    H.final.querySelector('.f-retry').addEventListener('click', onRetry);
}
export function hideFinal(H) {
    H.final.classList.remove('on');
    H.final.innerHTML = '';
}
