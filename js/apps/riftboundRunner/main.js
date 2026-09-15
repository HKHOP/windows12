import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import Popup from '../../modules/popup.js';
import Sounds from '../../modules/sounds.js';
import SystemConfig from '../../modules/systemConfig.js';

const RiftboundRunner = (() => {
    const APP_ID = 'riftboundRunner';
    const DATA_PATH = ['/', 'system', 'programs data', APP_ID];
    const W = 960, H = 540;
    const icon = `<svg viewBox="0 0 24 24" fill="none"><path d="M3 17.5 8 12l3.2 3.2L16 9l5 5" stroke="#8ff0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4h14v16H5z" stroke="#8ff0ff" stroke-width="1.5" opacity=".7"/><circle cx="16.8" cy="7.2" r="1.4" fill="#ffcf5a"/></svg>`;

    const worlds = [
        { name:'Glasswild', sub:'THE SHATTERED CANOPY', color:'#61e6c1', accent:'#b7fff0', mechanic:'Momentum', sky:['#081719','#123c3a'] },
        { name:'Emberworks', sub:'THE FORGE BELOW', color:'#ff8b5e', accent:'#ffd0a9', mechanic:'Heat & timing', sky:['#1d0d0b','#5b2418'] },
        { name:'Moonfall', sub:'THE SILENT ORBIT', color:'#8ea8ff', accent:'#d9e0ff', mechanic:'Gravity', sky:['#0b0d21','#252c63'] },
        { name:'Nullspire', sub:'THE BROKEN ENGINE', color:'#d38cff', accent:'#f1d5ff', mechanic:'Logic', sky:['#10091a','#382050'] }
    ];

    const levels = [
        // World 1: movement / momentum
        [
            {name:'First Step', goal:'Reach the beacon', layout:'intro'},
            {name:'Long Jump', goal:'Carry momentum across the gap', layout:'momentum'},
            {name:'Greenhouse', goal:'Thread the moving leaves', layout:'moving'},
            {name:'Thorn Clock', goal:'Time the safe windows', layout:'hazard'},
            {name:'Split Path', goal:'Choose the faster route', layout:'branch'},
            {name:'Canopy Key', goal:'Grab the key, then escape', layout:'key'},
            {name:'Wild Heart', goal:'Master momentum', layout:'gauntlet'}
        ],
        // World 2: heat / switches / conveyors
        [
            {name:'Warm Start', goal:'Cross the first furnace', layout:'heat'},
            {name:'Pressure Plate', goal:'Hold the plate to open the gate', layout:'plate'},
            {name:'Foundry Floor', goal:'Ride the conveyors', layout:'conveyor'},
            {name:'Three Valves', goal:'Route the steam', layout:'valves'},
            {name:'Redline', goal:'Dash before the vents cycle', layout:'redline'},
            {name:'Smelter Maze', goal:'Find the cool route', layout:'maze'},
            {name:'Core Ignition', goal:'Chain switches without stopping', layout:'gauntlet'}
        ],
        // World 3: gravity
        [
            {name:'Low Orbit', goal:'Learn the pull', layout:'gravity'},
            {name:'Moon Ladder', goal:'Climb the inverted route', layout:'gravity2'},
            {name:'Falling Up', goal:'Use the gravity wells', layout:'wells'},
            {name:'Satellite Yard', goal:'Bounce between anchors', layout:'bounces'},
            {name:'Dark Side', goal:'Move through the blackout', layout:'blackout'},
            {name:'Orbital Lock', goal:'Align the three orbs', layout:'orbs'},
            {name:'Moonbreak', goal:'Survive the collapsing orbit', layout:'gauntlet'}
        ],
        // World 4: logic / precision
        [
            {name:'Input', goal:'Learn the language of Nullspire', layout:'logic'},
            {name:'One-Way', goal:'Never step on the wrong tile', layout:'oneway'},
            {name:'Binary Bridge', goal:'Build the bridge with switches', layout:'binary'},
            {name:'Echo Room', goal:'Follow your own rhythm', layout:'echo'},
            {name:'Fault Line', goal:'Cross the unstable floor', layout:'fault'},
            {name:'The Machine', goal:'Solve the moving circuit', layout:'machine'},
            {name:'Riftbound', goal:'Close the rift', layout:'final'}
        ]
    ];

    const keys = new Set();
    let win = null, canvas, ctx, root;
    let game = null;
    let raf = 0;

    function ensureDataDir(){
        if(!FileSystem.itemExists(DATA_PATH)) FileSystem.createFolder(['/', 'system', 'programs data'], APP_ID);
    }
    function loadSave(){
        ensureDataDir();
        const raw = FileSystem.readFile([...DATA_PATH,'save.json']);
        try { return raw ? JSON.parse(raw) : {world:0,level:0,best:{},settings:{}}; } catch { return {world:0,level:0,best:{},settings:{}}; }
    }
    function saveData(){
        ensureDataDir();
        const p=[...DATA_PATH,'save.json'];
        const text=JSON.stringify({world:game.world,level:game.level,best:game.best,settings:game.settings});
        if(FileSystem.itemExists(p)) FileSystem.writeFile(p,text); else FileSystem.createFile(DATA_PATH,'save.json',text,'json');
    }

    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function rectsOverlap(a,b){return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;}
    function levelIndex(){return game.world*7+game.level;}
    function currentDef(){return levels[game.world][game.level];}
    function world(){return worlds[game.world];}

    function buildLevel(def){
        const p={x:48,y:430,w:22,h:28,vx:0,vy:0,onGround:false,coyote:0,jumpBuffer:0,dead:false,finished:false,spawnX:48,spawnY:430,invuln:0};
        const base=[];
        const hazards=[];
        const enemies=[];
        const platforms=[];
        const switches=[];
        const gates=[];
        const moving=[];
        const collectibles=[];
        const gravityZones=[];
        const WLD=world();
        const add=(x,y,w,h,type='solid')=>platforms.push({x,y,w,h,type});
        const spike=(x,y,w=34)=>hazards.push({x,y,w,h:18,type:'spike'});
        const enemy=(x,y,range=90,speed=.8)=>enemies.push({x,y,w:24,h:26,vx:speed,vy:0,start:x,range});
        const sw=(x,y,id)=>switches.push({x,y,w:22,h:22,on:false,id});
        const gate=(x,y,w,h,id)=>gates.push({x,y,w,h,id});
        const move=(x,y,w,h,dx,dy,speed)=>moving.push({x,y,w,h,ox:x,oy:y,dx,dy,t:Math.random()*10,speed});
        const gem=(x,y)=>collectibles.push({x,y,r:7,taken:false});
        const grav=(x,y,w,h,g)=>gravityZones.push({x,y,w,h,g});

        // Universal structure: a long side-scrolling room with bespoke route pieces.
        add(0,492,2600,48);
        switch(def.layout){
            case 'intro': add(180,410,100,18); add(360,350,120,18); add(560,290,110,18); add(760,370,120,18); add(980,315,140,18); add(1250,400,110,18); add(1450,330,130,18); add(1700,270,120,18); add(1950,370,160,18); enemy(620,464,70); gem(380,315); gem(1030,280); break;
            case 'momentum': add(170,420,100,18); add(340,360,80,18); add(520,300,90,18); add(720,390,80,18); add(900,300,90,18); add(1090,210,90,18); add(1290,300,100,18); add(1510,230,100,18); add(1740,330,90,18); add(1970,260,120,18); spike(280,474,90); spike(610,474,100); spike(1190,474,110); enemy(840,274,80,1.1); enemy(1590,204,70,1.1); break;
            case 'moving': add(180,420,80,18); add(430,360,70,18); add(700,300,70,18); add(980,360,70,18); add(1260,290,70,18); add(1530,350,70,18); add(1810,270,100,18); move(270,430,90,16,0,-100,1); move(530,430,90,16,0,-150,1.2); move(790,430,90,16,0,-180,.9); move(1050,430,90,16,0,-130,1.3); move(1340,430,90,16,0,-180,1.1); spike(350,474,90); spike(600,474,90); enemy(1420,464,100,.9); break;
            case 'hazard': add(180,400,120,18); add(390,330,100,18); add(600,400,100,18); add(820,310,120,18); add(1080,390,110,18); add(1300,300,110,18); add(1540,390,110,18); add(1780,280,110,18); add(2010,360,130,18); for(let x=270;x<2000;x+=130) spike(x,474,70); enemy(900,284,100,1.2); enemy(1600,364,90,1.4); break;
            case 'branch': add(160,410,120,18); add(340,330,140,18); add(340,440,140,18); add(590,250,110,18); add(590,380,110,18); add(800,310,110,18); add(1030,220,110,18); add(1220,350,130,18); add(1450,260,100,18); add(1660,390,120,18); add(1900,290,140,18); spike(480,474,80); spike(910,474,100); enemy(670,354,60,1); break;
            case 'key': add(170,410,100,18); add(380,340,110,18); add(620,270,110,18); add(850,360,100,18); add(1080,250,120,18); add(1350,330,100,18); add(1600,230,120,18); add(1880,350,130,18); sw(500,315,'A'); gate(720,360,22,132,'A'); gem(1130,210); enemy(1450,304,80,1.1); break;
            case 'heat': add(170,410,100,18); add(370,330,100,18); add(590,410,110,18); add(820,300,100,18); add(1040,390,110,18); add(1290,280,110,18); add(1530,360,100,18); add(1780,250,120,18); add(2010,350,140,18); for(let x=250;x<2050;x+=190) spike(x,474,80); enemy(1100,364,80,1.2); break;
            case 'plate': add(170,410,120,18); add(360,350,100,18); add(560,410,100,18); add(760,330,100,18); add(980,260,100,18); add(1200,360,100,18); add(1440,280,100,18); add(1670,380,100,18); add(1900,300,130,18); sw(620,382,'A'); gate(1040,350,24,142,'A'); enemy(800,304,50,.8); break;
            case 'conveyor': add(160,420,150,18); add(400,350,140,18); add(650,420,150,18); add(900,320,140,18); add(1160,390,130,18); add(1430,300,130,18); add(1700,390,130,18); add(1970,280,150,18); move(300,430,80,14,220,0,1.5); move(560,430,80,14,260,0,1.7); move(820,430,80,14,250,0,1.4); move(1300,430,80,14,300,0,1.8); spike(540,474,80); spike(1050,474,80); enemy(1500,274,80,1.4); break;
            case 'valves': add(160,420,110,18); add(360,330,90,18); add(560,240,90,18); add(780,350,90,18); add(1000,270,90,18); add(1220,390,90,18); add(1450,300,90,18); add(1680,210,90,18); add(1910,350,150,18); sw(400,295,'A'); sw(820,315,'B'); sw(1260,355,'C'); gate(650,300,22,192,'A'); gate(1100,300,22,192,'B'); gate(1550,300,22,192,'C'); break;
            case 'redline': add(150,420,120,18); add(360,360,100,18); add(570,300,100,18); add(780,370,100,18); add(1000,290,100,18); add(1220,350,100,18); add(1440,260,100,18); add(1660,340,100,18); add(1880,250,130,18); for(let x=300;x<1950;x+=180) spike(x,474,100); enemy(720,344,90,1.4); enemy(1500,234,80,1.5); break;
            case 'maze': add(160,420,130,18); add(330,330,120,18); add(500,240,120,18); add(680,330,120,18); add(850,420,120,18); add(1040,340,120,18); add(1230,240,120,18); add(1420,330,120,18); add(1610,420,120,18); add(1800,320,120,18); add(1990,220,140,18); gate(610,360,22,132,'A'); sw(530,205,'A'); enemy(900,394,70,1.1); enemy(1660,394,70,1.2); break;
            case 'gravity': add(150,430,120,18); add(360,350,110,18); add(600,260,110,18); add(840,350,110,18); add(1080,230,110,18); add(1320,340,110,18); add(1560,250,110,18); add(1800,360,110,18); add(2020,270,140,18); grav(500,150,500,330,-.55); enemy(1180,314,70,.8); break;
            case 'gravity2': add(160,430,120,18); add(360,360,100,18); add(560,290,100,18); add(760,220,100,18); add(960,290,100,18); add(1160,360,100,18); add(1360,220,100,18); add(1560,300,100,18); add(1760,200,100,18); add(1960,330,140,18); grav(300,100,1700,350,-.45); spike(480,474,100); spike(1100,474,100); break;
            case 'wells': add(150,420,120,18); add(380,350,90,18); add(620,420,90,18); add(860,300,90,18); add(1100,390,90,18); add(1340,260,90,18); add(1580,370,90,18); add(1820,240,90,18); add(2040,340,130,18); grav(420,180,160,250,-.9); grav(850,100,160,300,-.8); grav(1280,150,160,300,-1); grav(1720,100,160,300,-.9); enemy(970,364,70,1); break;
            case 'bounces': add(150,430,120,18); add(350,350,100,18); add(560,260,100,18); add(770,350,100,18); add(980,230,100,18); add(1190,330,100,18); add(1400,220,100,18); add(1610,320,100,18); add(1820,210,100,18); add(2030,330,130,18); for(let x=300;x<1900;x+=300) move(x,450,70,14,0,-140,1.5); break;
            case 'blackout': add(150,420,130,18); add(360,330,100,18); add(580,410,100,18); add(800,300,100,18); add(1030,390,100,18); add(1260,260,100,18); add(1490,360,100,18); add(1720,250,100,18); add(1950,340,140,18); spike(290,474,70); spike(690,474,90); spike(1120,474,90); spike(1610,474,90); enemy(870,274,60,1.3); enemy(1500,334,70,1.4); break;
            case 'orbs': add(150,420,130,18); add(350,330,110,18); add(570,250,110,18); add(800,350,110,18); add(1040,270,110,18); add(1280,380,110,18); add(1510,290,110,18); add(1740,200,110,18); add(1980,330,140,18); sw(430,295,'A'); sw(850,315,'B'); sw(1320,345,'C'); gem(600,210); gem(1060,230); gem(1780,160); gate(700,300,22,192,'A'); gate(1200,300,22,192,'B'); gate(1660,300,22,192,'C'); break;
            case 'logic': add(150,420,140,18); add(380,340,120,18); add(610,260,120,18); add(840,350,120,18); add(1070,240,120,18); add(1300,340,120,18); add(1530,250,120,18); add(1760,360,120,18); add(1990,270,150,18); sw(440,305,'A'); gate(760,300,22,192,'A'); break;
            case 'oneway': add(150,420,120,18); add(330,350,90,18); add(490,280,90,18); add(650,350,90,18); add(810,280,90,18); add(970,350,90,18); add(1130,280,90,18); add(1290,350,90,18); add(1450,280,90,18); add(1610,350,90,18); add(1770,280,90,18); add(1930,350,170,18); for(let x=270;x<1900;x+=160) spike(x,474,60); break;
            case 'binary': add(150,420,120,18); add(370,340,100,18); add(590,260,100,18); add(810,350,100,18); add(1030,270,100,18); add(1250,380,100,18); add(1470,290,100,18); add(1690,200,100,18); add(1910,330,150,18); sw(410,305,'A'); sw(630,225,'B'); sw(850,315,'C'); gate(730,300,22,192,'A'); gate(1160,300,22,192,'B'); gate(1610,300,22,192,'C'); break;
            case 'echo': add(150,420,120,18); add(350,340,100,18); add(550,260,100,18); add(750,340,100,18); add(950,260,100,18); add(1150,340,100,18); add(1350,260,100,18); add(1550,340,100,18); add(1750,260,100,18); add(1950,340,160,18); move(300,430,70,14,0,-100,1); move(700,430,70,14,0,-140,1); move(1100,430,70,14,0,-160,1); move(1500,430,70,14,0,-130,1); break;
            case 'fault': add(150,420,120,18); add(350,350,100,18); add(560,420,90,18); add(760,300,100,18); add(970,380,90,18); add(1180,260,100,18); add(1390,350,90,18); add(1600,230,100,18); add(1810,330,100,18); add(2020,250,140,18); for(let x=290;x<2000;x+=140) spike(x,474,60); enemy(800,274,70,1.5); enemy(1700,204,70,1.5); break;
            case 'machine': add(150,420,130,18); add(360,320,100,18); add(560,240,100,18); add(780,350,100,18); add(1000,220,100,18); add(1220,330,100,18); add(1440,250,100,18); add(1660,360,100,18); add(1880,230,100,18); add(2080,330,120,18); move(470,430,80,14,0,-180,1.3); move(900,430,80,14,0,-200,1.5); move(1350,430,80,14,0,-190,1.4); sw(600,205,'A'); sw(1260,295,'B'); gate(700,300,22,192,'A'); gate(1550,300,22,192,'B'); enemy(1100,194,70,1.2); break;
            case 'final': add(150,420,120,18); add(330,340,100,18); add(510,260,100,18); add(690,360,100,18); add(870,280,100,18); add(1050,200,100,18); add(1230,330,100,18); add(1410,240,100,18); add(1590,340,100,18); add(1770,220,100,18); add(1950,320,100,18); add(2120,230,140,18); sw(390,305,'A'); sw(910,245,'B'); sw(1450,205,'C'); gate(620,300,22,192,'A'); gate(1140,300,22,192,'B'); gate(1680,300,22,192,'C'); spike(270,474,70); spike(620,474,70); spike(970,474,70); spike(1320,474,70); spike(1670,474,70); enemy(760,334,60,1.5); enemy(1510,214,60,1.7); enemy(1870,294,70,1.7); break;
            default: add(200,400,160,18); add(500,330,160,18); add(800,260,160,18); add(1100,330,160,18); add(1400,250,160,18); add(1700,350,160,18); add(2000,260,180,18);
        }
        // Finish beacon and decorative background markers.
        const finish={x:Math.max(2150, platforms.reduce((m,p)=>Math.max(m,p.x+p.w),0)-80),y:430,w:28,h:62};
        if(def.layout==='final') finish.x=2160;
        return {p,platforms,hazards,enemies,switches,gates,moving,collectibles,gravityZones,finish,camera:0,elapsed:0,checkpoint:null,shake:0};
    }

    function resetLevel(){
        game.levelState=buildLevel(currentDef());
        game.levelState.p.spawnX=48; game.levelState.p.spawnY=430;
        game.levelState.p.x=48; game.levelState.p.y=430;
        game.levelState.checkpoint=null;
        game.levelState.started=performance.now();
        game.deaths=game.deaths||0;
        updateHud();
    }
    function die(){
        const s=game.levelState,p=s.p;
        if(p.dead) return;
        p.dead=true; game.deaths++; game.levelState.shake=12; Sounds.error();
        setTimeout(()=>{
            if(!win?.element?.isConnected) return;
            const spawn=s.checkpoint||{x:48,y:430};
            p.x=spawn.x;p.y=spawn.y;p.vx=0;p.vy=0;p.dead=false;p.invuln=45;
            updateHud();
        },420);
    }
    function complete(){
        const s=game.levelState;
        if(s.p.finished) return;
        s.p.finished=true; Sounds.confirm();
        const time=(performance.now()-s.started)/1000;
        const key=`${game.world}-${game.level}`;
        if(!game.best[key]||time<game.best[key]) game.best[key]=time;
        saveData(); updateHud();
        setTimeout(()=>showLevelComplete(time),250);
    }
    function showLevelComplete(time){
        if(!win?.element?.isConnected) return;
        const nextWorld=game.world+(game.level===6?1:0), nextLevel=game.level===6?0:game.level+1;
        const last=game.world===3&&game.level===6;
        const modal=document.createElement('div'); modal.className='rr-modal';
        modal.innerHTML=`<div class="rr-card"><div class="rr-kicker">${last?'RIFT SEALED':'LEVEL CLEARED'}</div><h2>${last?'Riftbound Runner':'Nice run.'}</h2><div class="rr-stat"><span>TIME</span><b>${time.toFixed(2)}s</b></div><div class="rr-stat"><span>DEATHS</span><b>${game.deaths}</b></div><div class="rr-actions"><button class="rr-btn secondary" data-retry>Replay</button>${last?'<button class="rr-btn primary" data-map>World Map</button>':`<button class="rr-btn primary" data-next>${levels[nextWorld][nextLevel].name} →</button>`}</div></div>`;
        root.appendChild(modal);
        modal.querySelector('[data-retry]')?.addEventListener('click',()=>{modal.remove();game.deaths=0;resetLevel();});
        modal.querySelector('[data-next]')?.addEventListener('click',()=>{modal.remove();game.world=nextWorld;game.level=nextLevel;game.deaths=0;resetLevel();saveData();renderWorldPanel();});
        modal.querySelector('[data-map]')?.addEventListener('click',()=>{modal.remove();renderWorldPanel();});
    }

    function update(dt){
        const s=game.levelState,p=s.p;
        if(!s||p.dead||p.finished) return;
        s.elapsed+=dt;
        const left=keys.has('ArrowLeft')||keys.has('a')||keys.has('A');
        const right=keys.has('ArrowRight')||keys.has('d')||keys.has('D');
        const jump=keys.has('ArrowUp')||keys.has('w')||keys.has('W')||keys.has(' ');
        if(left) p.vx-=0.65; if(right) p.vx+=0.65;
        p.vx*=p.onGround?0.80:0.92; p.vx=clamp(p.vx,-6.2,6.2);
        if(jump && p.onGround) { p.vy=-12; p.onGround=false; Sounds.click(); }
        p.vy+=0.58;
        let g=0.58;
        for(const z of s.gravityZones) if(rectsOverlap(p,z)) g=z.g;
        p.vy += (g-0.58);
        p.vy=clamp(p.vy,-15,14);
        p.x+=p.vx;p.y+=p.vy;
        p.onGround=false;
        // moving platforms update first
        for(const m of s.moving){m.t+=dt*m.speed; m.x=m.ox+Math.sin(m.t)*m.dx; m.y=m.oy+Math.sin(m.t*.9)*m.dy;}
        const solids=[...s.platforms,...s.moving,...s.gates.filter(g=>!s.switches.find(sw=>sw.id===g.id&&sw.on))];
        for(const o of solids){
            if(rectsOverlap(p,o) && p.vy>=0 && p.y+p.h-p.vy<=o.y+5){p.y=o.y-p.h;p.vy=0;p.onGround=true;}
            else if(rectsOverlap(p,o) && p.vy<0 && p.y-p.vy>=o.y+o.h-4){p.y=o.y+o.h;p.vy=0;}
            else if(rectsOverlap(p,o)){ if(p.x<p.x+p.w){ if(p.vx>0)p.x=o.x-p.w; else if(p.vx<0)p.x=o.x+o.w; p.vx*=.25; } }
        }
        for(const sw of s.switches){ if(rectsOverlap(p,sw)){sw.on=true;} }
        for(const e of s.enemies){e.x+=e.vx;if(Math.abs(e.x-e.start)>e.range)e.vx*=-1; if(rectsOverlap(p,e)&&p.vy>2&&p.y+p.h<e.y+12){e.dead=true;p.vy=-8;} else if(rectsOverlap(p,e)&&p.invuln<=0) die();}
        s.enemies=s.enemies.filter(e=>!e.dead);
        for(const h of s.hazards) if(rectsOverlap(p,h)&&p.invuln<=0) die();
        for(const c of s.collectibles) if(!c.taken && Math.hypot(p.x+p.w/2-c.x,p.y+p.h/2-c.y)<20){c.taken=true;Sounds.click();}
        if(p.y>570) die();
        p.invuln=Math.max(0,p.invuln-1);
        if(p.x>1200 && !s.checkpoint) s.checkpoint={x:p.x,y:Math.min(p.y,430)};
        if(rectsOverlap(p,s.finish)) complete();
        s.camera=clamp(p.x-260,0,1800);
        updateHud();
    }

    function draw(){
        if(!ctx||!game?.levelState) return;
        const s=game.levelState,w=world(),d=currentDef();
        ctx.clearRect(0,0,W,H);
        const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,w.sky[0]);grad.addColorStop(1,w.sky[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
        // parallax skyline
        ctx.save();ctx.translate(-s.camera*.18,0);for(let i=0;i<22;i++){const x=i*150;ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(x,120+(i%5)*18,100,320-(i%5)*20);}ctx.restore();
        ctx.save();ctx.translate(-s.camera,0);
        // distant line
        ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=2;ctx.beginPath();for(let x=0;x<2600;x+=80){ctx.lineTo(x,455-Math.sin(x*.008)*18);}ctx.stroke();
        for(const p of s.platforms){ctx.fillStyle=p.type==='solid'?'#19252a':'#222';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle=w.color;ctx.fillRect(p.x,p.y,p.w,3);}
        for(const m of s.moving){ctx.fillStyle='#27343b';ctx.fillRect(m.x,m.y,m.w,m.h);ctx.fillStyle=w.accent;ctx.fillRect(m.x,m.y,m.w,3);}
        for(const g of s.gates){const sw=s.switches.find(x=>x.id===g.id);if(!sw?.on){ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(g.x,g.y,g.w,g.h);ctx.strokeStyle=w.color;ctx.strokeRect(g.x,g.y,g.w,g.h);}}
        for(const h of s.hazards){ctx.fillStyle='#ff5368';ctx.beginPath();for(let x=h.x;x<h.x+h.w;x+=14){ctx.lineTo(x,h.y+h.h);ctx.lineTo(x+7,h.y);ctx.lineTo(x+14,h.y+h.h);}ctx.fill();}
        for(const sw of s.switches){ctx.fillStyle=sw.on?'#7cff9d':w.color;ctx.fillRect(sw.x,sw.y,sw.w,sw.h);ctx.fillStyle='#071014';ctx.fillRect(sw.x+5,sw.y+5,12,12);}
        for(const c of s.collectibles){if(!c.taken){ctx.beginPath();ctx.arc(c.x,c.y,7+Math.sin(s.elapsed*5+c.x)*2,0,Math.PI*2);ctx.fillStyle='#ffcf5a';ctx.fill();}}
        for(const e of s.enemies){ctx.fillStyle='#f05d72';ctx.fillRect(e.x,e.y,e.w,e.h);ctx.fillStyle='#170d14';ctx.fillRect(e.x+5,e.y+7,4,4);ctx.fillRect(e.x+15,e.y+7,4,4);}
        // finish beacon
        ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(s.finish.x+11,s.finish.y,4,s.finish.h);ctx.beginPath();ctx.arc(s.finish.x+13,s.finish.y,14+Math.sin(s.elapsed*5)*3,0,Math.PI*2);ctx.fillStyle=w.color;ctx.globalAlpha=.2;ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=w.accent;ctx.fillRect(s.finish.x,s.finish.y+4,28,20);
        // player
        const p=s.p;ctx.fillStyle='#f4f7f8';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle=w.color;ctx.fillRect(p.x,p.y,p.w,5);ctx.fillStyle='#10161a';ctx.fillRect(p.x+5,p.y+9,4,4);ctx.fillRect(p.x+14,p.y+9,4,4);
        ctx.restore();
        // vignette
        const v=ctx.createLinearGradient(0,0,W,0);v.addColorStop(0,'rgba(0,0,0,.18)');v.addColorStop(.15,'transparent');v.addColorStop(.85,'transparent');v.addColorStop(1,'rgba(0,0,0,.18)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    }

    function gameLoop(t){
        if(!win?.element?.isConnected){cancelAnimationFrame(raf);return;}
        const now=t||performance.now();const dt=Math.min(.033,(now-(game.last||now))/1000);game.last=now;update(dt);draw();raf=requestAnimationFrame(gameLoop);
    }

    function updateHud(){
        if(!root||!game?.levelState)return;
        const d=currentDef();
        const time=game.levelState.started?((performance.now()-game.levelState.started)/1000):0;
        root.querySelector('[data-world]').textContent=world().name;
        root.querySelector('[data-level]').textContent=`${game.level+1}/7 · ${d.name}`;
        root.querySelector('[data-goal]').textContent=d.goal;
        root.querySelector('[data-time]').textContent=`${time.toFixed(1)}s`;
        root.querySelector('[data-deaths]').textContent=game.deaths;
        root.querySelector('[data-progress]').style.width=`${((levelIndex())/28)*100}%`;
    }

    function renderWorldPanel(){
        const panel=root.querySelector('#worldPanel');
        panel.innerHTML=`<div class="rr-map-head"><div><div class="rr-kicker">WORLD SELECT</div><h2>Four unstable places.</h2><p>Each world introduces a new rule. Each level asks you to break it perfectly.</p></div><button class="rr-close-map" data-close>×</button></div><div class="rr-worlds">${worlds.map((w,i)=>`<section class="rr-world" style="--wc:${w.color}"><div class="rr-world-title"><div><b>${String(i+1).padStart(2,'0')} · ${w.name}</b><span>${w.sub}</span></div><em>${w.mechanic}</em></div><div class="rr-level-grid">${levels[i].map((l,j)=>{const unlocked=i<game.world||(i===game.world&&j<=game.level);const best=game.best[`${i}-${j}`];return `<button class="rr-level ${unlocked?'':'locked'} ${i===game.world&&j===game.level?'current':''}" data-world="${i}" data-level="${j}" ${unlocked?'':'disabled'}><strong>${String(j+1).padStart(2,'0')}</strong><span>${l.name}</span><small>${best?best.toFixed(2)+'s':unlocked?'READY':'LOCKED'}</small></button>`}).join('')}</div></section>`).join('')}</div>`;
        panel.classList.add('open');
        panel.querySelector('[data-close]').addEventListener('click',()=>panel.classList.remove('open'));
        panel.querySelectorAll('.rr-level:not(.locked)').forEach(b=>b.addEventListener('click',()=>{game.world=+b.dataset.world;game.level=+b.dataset.level;game.deaths=0;resetLevel();saveData();panel.classList.remove('open');}));
    }

    function startNew(){game.world=0;game.level=0;game.best={};game.deaths=0;saveData();resetLevel();renderWorldPanel();}

    function getContent(){
        return `<div class="rr-root"><style>
        .rr-root{height:100%;display:flex;flex-direction:column;background:#081014;color:#eef7f8;font-family:Segoe UI,system-ui,sans-serif;overflow:hidden;position:relative}
        .rr-top{height:64px;display:flex;align-items:center;gap:18px;padding:0 18px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(5,10,13,.88);backdrop-filter:blur(12px);z-index:5}.rr-brand{display:flex;align-items:center;gap:10px;min-width:180px}.rr-brand svg{width:28px;height:28px}.rr-brand b{font-size:15px;letter-spacing:.3px}.rr-kicker{font-size:10px;letter-spacing:2px;font-weight:700;opacity:.58}.rr-worldname{font-size:12px;color:#b7c7ca}.rr-center{flex:1;min-width:0}.rr-level{font-size:13px;font-weight:700}.rr-goal{font-size:11px;color:#8da0a5;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rr-stats{display:flex;gap:18px;font-variant-numeric:tabular-nums}.rr-statbox span{display:block;font-size:9px;letter-spacing:1.5px;color:#718388}.rr-statbox b{font-size:12px}.rr-iconbtn{width:34px;height:34px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#111a1e;color:#dfeaec;cursor:pointer}.rr-iconbtn:hover{background:#1a272c}.rr-progress{position:absolute;left:0;bottom:-1px;height:2px;background:var(--accent);width:0;transition:width .2s}.rr-canvas-wrap{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#05090b}.rr-canvas{width:100%;height:100%;image-rendering:auto;display:block}.rr-bottom{height:50px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-top:1px solid rgba(255,255,255,.08);background:#0b1418;color:#7f9398;font-size:11px}.rr-controls{display:flex;gap:8px}.rr-key{border:1px solid rgba(255,255,255,.12);background:#121c20;border-radius:6px;padding:4px 7px;color:#cbd8da}.rr-touch{display:none;gap:7px}.rr-touch button{width:42px;height:32px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#152126;color:white}.rr-modal,.rr-world-panel{position:absolute;inset:0;background:rgba(2,5,7,.68);backdrop-filter:blur(10px);z-index:20;display:flex;align-items:center;justify-content:center}.rr-card{width:360px;padding:28px;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:#0e181d;box-shadow:0 25px 80px #0009}.rr-card h2{margin:5px 0 22px;font-size:28px}.rr-stat{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid rgba(255,255,255,.08)}.rr-stat span{font-size:10px;letter-spacing:1.4px;color:#74878c}.rr-actions{display:flex;gap:9px;margin-top:20px}.rr-btn{flex:1;padding:11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);cursor:pointer;font-weight:700}.rr-btn.primary{background:#dffcff;color:#061012}.rr-btn.secondary{background:#152126;color:#d7e2e4}.rr-world-panel{display:none;align-items:stretch;justify-content:stretch;padding:26px;overflow:auto}.rr-world-panel.open{display:flex}.rr-map-head{display:flex;justify-content:space-between;gap:20px;max-width:1100px;width:100%;margin:0 auto 22px}.rr-map-head h2{font-size:28px;margin:4px 0}.rr-map-head p{margin:0;color:#83979d;font-size:12px}.rr-close-map{width:38px;height:38px;border:1px solid rgba(255,255,255,.12);background:#10191d;color:white;border-radius:10px;font-size:23px;cursor:pointer}.rr-worlds{width:100%;max-width:1100px;margin:auto}.rr-world{padding:17px 0 22px;border-top:1px solid rgba(255,255,255,.08)}.rr-world-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.rr-world-title b{display:block;font-size:15px}.rr-world-title span{font-size:10px;letter-spacing:1.3px;color:#6e8288}.rr-world-title em{font-style:normal;color:var(--wc);font-size:11px}.rr-level-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.rr-level{min-width:0;text-align:left;padding:11px;border:1px solid rgba(255,255,255,.1);background:#101a1e;color:#dce7e9;border-radius:10px;cursor:pointer}.rr-level:hover,.rr-level.current{border-color:var(--wc);box-shadow:0 0 0 1px var(--wc) inset}.rr-level.locked{opacity:.35;cursor:not-allowed}.rr-level strong{font-size:10px;color:var(--wc)}.rr-level span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;margin:4px 0}.rr-level small{font-size:9px;color:#73858a}.rr-hint{color:#687c82}.rr-touch{display:none}
        @media(max-width:760px){.rr-stats{display:none}.rr-brand{min-width:125px}.rr-controls{display:none}.rr-touch{display:flex}.rr-level-grid{grid-template-columns:repeat(2,1fr)}}
        </style><div class="rr-top" style="--accent:${world().color}"><div class="rr-brand">${icon}<div><b>Riftbound Runner</b><div class="rr-worldname" data-world></div></div></div><div class="rr-center"><div class="rr-level" data-level></div><div class="rr-goal" data-goal></div></div><div class="rr-stats"><div class="rr-statbox"><span>TIME</span><b data-time>0.0s</b></div><div class="rr-statbox"><span>DEATHS</span><b data-deaths>0</b></div></div><button class="rr-iconbtn" data-map title="World Map">☷</button><button class="rr-iconbtn" data-restart title="Restart">↻</button><div class="rr-progress" data-progress></div></div><div class="rr-canvas-wrap"><canvas class="rr-canvas" width="960" height="540"></canvas><div id="worldPanel" class="rr-world-panel"></div></div><div class="rr-bottom"><div class="rr-controls"><span class="rr-key">A / D</span><span class="rr-key">Move</span><span class="rr-key">W / Space</span><span class="rr-key">Jump</span><span class="rr-hint">Reach the beacon. Learn the room. Don't rush the puzzle.</span></div><div class="rr-touch"><button data-left>←</button><button data-jump>↑</button><button data-right>→</button></div><div>Level ${levelIndex()+1} / 28</div></div></div>`;
    }

    function bind(){
        root=win.element.querySelector('.rr-root');canvas=root.querySelector('canvas');ctx=canvas.getContext('2d');
        root.querySelector('[data-map]').addEventListener('click',renderWorldPanel);
        root.querySelector('[data-restart]').addEventListener('click',()=>{game.deaths=0;resetLevel();});
        const touch=(sel,key)=>{const b=root.querySelector(sel);if(!b)return;b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(key);});b.addEventListener('pointerup',()=>keys.delete(key));b.addEventListener('pointerleave',()=>keys.delete(key));};
        touch('[data-left]','ArrowLeft');touch('[data-right]','ArrowRight');touch('[data-jump]',' ');
        root.addEventListener('pointerdown',()=>WindowManager.focusWindow(win.id));
        game.settings=SystemConfig.getAll?SystemConfig.getAll():{};
        window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
        win.element.addEventListener('mousedown',()=>WindowManager.focusWindow(win.id));
        resetLevel();raf=requestAnimationFrame(gameLoop);
    }
    function onKey(e){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','w','a','s','d','W','A','S','D'].includes(e.key)){e.preventDefault();keys.add(e.key);}}
    function onKeyUp(e){keys.delete(e.key);}

    function launch(){
        const save=loadSave();
        game={world:clamp(save.world||0,0,3),level:clamp(save.level||0,0,6),best:save.best||{},deaths:0,settings:save.settings||{},last:performance.now()};
        win=WindowManager.createWindow(APP_ID,'Riftbound Runner',icon,getContent(),{width:1100,height:720,minWidth:760,minHeight:520,saveState:true});
        bind();
    }
    return {launch};
})();
export default RiftboundRunner;
