const assert=require('node:assert/strict');
const path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
const {g,sandbox}=require('../tests/harness.cjs')();
(async()=>{
  let count=0;
  const preview=createCanvas(960,360),pc=preview.getContext('2d');
  pc.fillStyle='#292c39';pc.fillRect(0,0,960,360);
  let actor=0;
  for(const [name,atlas] of Object.entries(sandbox.window.ArenaAtlas)){
    const img=await loadImage(path.join(__dirname,'../dist',g.assetPaths[name]));
    const c=createCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    for(const row of atlas.rows)for(const [x,y,w,h,pivot,feet] of row){
      assert.ok(x>=8&&y>=8&&x+w+8<=img.width&&y+h+8<=img.height);
      assert.ok(Number.isFinite(pivot)&&feet===h);
      const a=ctx.getImageData(x-2,y-2,w+4,h+4).data,W=w+4,H=h+4;
      for(let j=0;j<H;j++)for(let i=0;i<W;i++)if(i<2||i>=W-2||j<2||j>=H-2)assert.equal(a[(j*W+i)*4+3],0,'Nontransparent frame gutter');
      count++;
    }
    for(let f=0;f<4;f++){
      const [x,y,w,h,p,feet]=atlas.rows[name==='sorcererDetailed'?0:1][f],s=atlas.scale;
      pc.drawImage(img,x,y,w,h,120+f*240-p*s,85+actor*90-feet*s,w*s,h*s);
    }
    actor++;
  }
  if(process.argv[2])require('node:fs').writeFileSync(process.argv[2],preview.toBuffer('image/png'));
  console.log(`PASS: ${count} WebP frames have transparent gutters, valid bounds and floor anchors.`);
})();
