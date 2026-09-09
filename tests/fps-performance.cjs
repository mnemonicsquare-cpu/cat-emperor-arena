const fs=require('node:fs'),assert=require('node:assert/strict');
const core=require('../dist/level2-core.js');
const current=fs.readFileSync(require.resolve('../dist/level2.js'),'utf8');
const baseline=process.argv[2]&&fs.readFileSync(process.argv[2],'utf8');
function renderer(source,w,h){
  const fragment=source.slice(source.indexOf('  function writePixel('),source.indexOf('  function renderSprites('));
  return new Function('core',`const sceneW=${w},sceneH=${h},FOV=Math.PI*.39;
    const sceneImage={data:new Uint8ClampedArray(sceneW*sceneH*4)},sceneCtx={putImageData(){}},zBuffer=[];
    const texturePixels=Array.from({length:8},(_,t)=>Uint8ClampedArray.from({length:16384},(_,i)=>(i*17+t*31)%256));
    const world=core.buildWorld(),player={x:12.5,y:12.5,angle:0,bob:0,moving:0};let cameraKick=0;
    ${fragment}
    return {renderWorld,player,world,data:sceneImage.data};`)(core);
}
for(const [w,h] of [[320,180],[256,144]]){
  const next=renderer(current,w,h),old=baseline&&renderer(baseline,w,h);
  for(let i=0;i<32;i++){
    for(const engine of [next,old].filter(Boolean)){
      engine.player.angle=i*.23;engine.player.bob=i*.4;engine.player.moving=i%3;
      for(const door of engine.world.doors.values())door.open=(i%10)/10;
      engine.renderWorld();
    }
    if(old)assert.deepEqual(next.data,old.data,'world renderer pixels changed');
  }
  const measure=engine=>{for(let i=0;i<60;i++)engine.renderWorld();const t=performance.now();for(let i=0;i<300;i++)engine.renderWorld();return (performance.now()-t)/300;};
  console.log(`${w}x${h}: current ${measure(next).toFixed(3)} ms`+(old?`, baseline ${measure(old).toFixed(3)} ms; 32 frames pixel-identical`:''));
}
