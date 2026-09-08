const assert=require('node:assert/strict');
const {g,calls,sandbox}=require('./harness.cjs')();

// Reproduce edge oscillation across every start/target platform and ground.
const surfaces=[...g.platforms,{x:28,y:g.GROUND_Y,w:1864}];
let cases=0;
for(const start of g.platforms)for(const target of surfaces)for(const offset of [.2,.5,.8]){
  Object.assign(g.player,{x:target.x+target.w*offset,y:target.y,state:'idle',grounded:true,invuln:999});
  const mouse=g.createMouse({x:start.x+start.w/2,y:start.y,patrolMin:start.x+28,patrolMax:start.x+start.w-28},0);
  mouse.alerted=true;let flips=0,previous=mouse.facing;
  for(let i=0;i<600;i++){
    g.updateMouse(mouse,1/60);
    if(i>480&&mouse.facing!==previous)flips++;
    previous=mouse.facing;
  }
  assert.ok(flips<12,`Edge oscillation: ${start.x},${start.y} → ${target.x},${target.y}: ${flips}`);
  cases++;
}

// A small visible move and proximity to the cat are allowed. Ground is not a platform.
g.setCamera(0,600);
for(const enemy of [...g.mice,...g.sorcerers])enemy.state='dead';
Object.assign(g.player,{x:1100,y:g.GROUND_Y,state:'idle'});
const wizard=g.sorcerers[0];Object.assign(wizard,{x:180,y:g.GROUND_Y,state:'idle'});
const candidates=[];
for(const p of g.platforms)for(let x=p.x+28;x<=p.x+p.w-28;x+=16){
  const point={x,y:p.y};if(g.validTeleportTarget(wizard,point))candidates.push(point);
}
assert.ok(candidates.length);
const nearby=candidates[0];
Object.assign(wizard,{x:nearby.x+10,y:nearby.y});
Object.assign(g.player,{x:nearby.x+55,y:nearby.y});
assert.equal(g.validTeleportTarget(wizard,nearby),true);
assert.equal(g.validTeleportTarget(wizard,{x:nearby.x,y:g.GROUND_Y}),false);
Object.assign(wizard,{x:180,y:g.GROUND_Y});Object.assign(g.player,{x:1100,y:g.GROUND_Y});
const levels=[...new Set(candidates.map(p=>p.y))],selected=new Set();
for(let i=0;i<levels.length;i++){
  sandbox.Math.random=()=> (i+.5)/levels.length;
  const point=g.chooseTeleportTarget(wizard);assert.ok(g.validTeleportTarget(wizard,point));selected.add(point.y);
}
assert.equal(selected.size,levels.length);

// Drawing the hero uses distance-based gait, independent of elapsed idle time.
g.images.catDetailed={};g.player.state='run';g.player.invuln=0;
const gait=sandbox.window.ArenaAtlas.catDetailed.rows[1];
for(let step=0;step<8;step++){
  g.player.strideDistance=step*16;calls.length=0;g.drawPlayer();
  const draw=calls.find(c=>c[0]==='drawImage');
  assert.equal(draw[2],gait[step%4][0]);assert.equal(draw[3],gait[step%4][1]);
}
const stopped=g.createMouse({x:300,y:g.GROUND_Y},0);
Object.assign(stopped,{state:'run',grounded:true,vx:0});
g.moveMouse(stopped,1/30);assert.equal(stopped.strideDistance,0);
console.log(`PASS: ${cases} pursuit routes, all visible teleport levels, nearby targets, four distance-based hero step phases.`);
