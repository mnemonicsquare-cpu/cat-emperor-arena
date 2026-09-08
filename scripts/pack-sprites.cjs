// Repack the existing character artwork into isolated, padded frames. This is
// atlas processing, not redrawing: retain the connected character silhouette,
// remove neighboring frame fragments, and normalize source resolution to 3x.
const fs = require('node:fs');
const path = require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const originals=require('./source-atlas.json');
const root=path.join(__dirname,'../dist/assets/sprites');

function isolate(image, rect, margin=0) {
  if(margin){const [x,y,w,h,p]=rect,left=Math.max(0,x-margin),top=Math.max(0,y-margin);rect=[left,top,Math.min(image.width,x+w+margin)-left,Math.min(image.height,y+h+margin)-top,p+x-left];}
  const [sx,sy,sw,sh,pivot]=rect;
  const w=Math.ceil(sw),h=Math.ceil(sh);
  const canvas=createCanvas(w,h),ctx=canvas.getContext('2d');
  ctx.drawImage(image,sx,sy,sw,sh,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h),labels=new Int32Array(w*h),queue=new Int32Array(w*h);
  // Some source atlases encode their neutral transparency preview as RGB.
  // Decode only the border-connected matte; enclosed white fur stays opaque.
  if (pixels.data[3]===255 && pixels.data[0]>150 && Math.max(...pixels.data.slice(0,3))-Math.min(...pixels.data.slice(0,3))<25) {
    const seen=new Uint8Array(w*h);let head=0,tail=0;
    const visit=(i)=>{if(i<0||i>=w*h||seen[i])return;seen[i]=1;const p=i*4;
      if(Math.min(pixels.data[p],pixels.data[p+1],pixels.data[p+2])>145 && Math.max(pixels.data[p],pixels.data[p+1],pixels.data[p+2])-Math.min(pixels.data[p],pixels.data[p+1],pixels.data[p+2])<30)queue[tail++]=i;};
    for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
    while(head<tail){const i=queue[head++];pixels.data[i*4+3]=0;if(i%w)visit(i-1);if(i%w<w-1)visit(i+1);visit(i-w);visit(i+w);}
  }
  let label=0,best=0,bestSize=0;
  for(let i=0;i<labels.length;i++) {
    if(labels[i]||pixels.data[i*4+3]<96)continue;
    label++;let head=0,tail=1;queue[0]=i;labels[i]=label;
    while(head<tail){const v=queue[head++],x=v%w,y=Math.floor(v/w);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,j=ny*w+nx;
        if(nx<0||nx>=w||ny<0||ny>=h||labels[j]||pixels.data[j*4+3]<96)continue;
        labels[j]=label;queue[tail++]=j;
      }
    }
    if(tail>bestSize){bestSize=tail;best=label;}
  }
  if(bestSize<50)throw Error('Empty/invalid character frame');
  let left=w,top=h,right=0,bottom=0;
  for(let i=0;i<labels.length;i++) {
    let keep=labels[i]===best;
    const x=i%w,y=Math.floor(i/w);
    // Preserve the one-pixel antialiased fringe around the chosen component.
    if(!keep&&pixels.data[i*4+3]>0)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&labels[(y+dy)*w+x+dx]===best)keep=true;
    }
    if(!keep){pixels.data[i*4+3]=0;continue;}
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  ctx.putImageData(pixels,0,0);
  return {canvas,x:left,y:top,w:right-left,h:bottom-top,pivot:pivot-left,components:label};
}

// A row of generated motion has a fixed source scale, even for passing poses.
async function motion(file,cols,rows,targetHeight,idleRow=0) {
  const image=await loadImage(path.join(root,file));
  const frames=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const x=Math.round(c*image.width/cols),y=Math.round(r*image.height/rows);
    const w=Math.round((c+1)*image.width/cols)-x,h=Math.round((r+1)*image.height/rows)-y;
    if(file.startsWith('cat_')) {
      // Reuse the complete torso/weapon layer, animate the four leg phases.
      // This also avoids the truncated weapon at the source sheet's right edge.
      const layer=createCanvas(w+24,h),lc=layer.getContext('2d');
      lc.drawImage(image,0,y,w+24,h,0,0,w+24,h);
      if(r===1){const split=Math.round(h*.64);lc.drawImage(image,x,y+split,w,h-split,0,split,w,h-split);}
      frames.push(isolate(layer,[0,0,w+24,h,w*.64,h]));
    } else frames.push(isolate(image,[x,y,w,h,w*.57,h]));
  }
  const reference=frames.slice(idleRow*cols,(idleRow+1)*cols);
  const height=reference.reduce((sum,f)=>sum+f.h,0)/reference.length;
  for(const f of frames)f.scale=targetHeight/height;
  return frames;
}

(async()=>{
  const catMotion=await motion('cat_motion_source.webp',4,2,74);
  const redMotion=await motion('cultist_motion_source.webp',2,2,60);
  const zombieMotion=await motion('zombie_motion_source.webp',2,2,77);
  const atlas={};
  for(const [name,file,target,rows] of [
    ['catDetailed','cat_emperor_detailed.webp',74,6],['mouseDetailed','cultist_mouse_detailed.webp',60,4],
    ['sorcererDetailed','sorcerer_mouse_detailed.webp',86,3],['zombieDetailed','zombie_mouse.png',80,4]]){
    const image=await loadImage(path.join(root,file));
    const out=[];
    for(let row=0;row<rows;row++)for(let col=0;col<4;col++){
      let f;
      if(name==='catDetailed'&&row<2)f=catMotion[row*4+col];
      else if(name==='mouseDetailed'&&row===1)f=redMotion[col];
      else if(name==='zombieDetailed'&&row===1)f=zombieMotion[col];
      else if(name==='zombieDetailed'){
        const ys=[0,310,610,950],hs=[310,300,340,312];
        const xs=row===0?[0,310,610,914,1246]:[0,311,623,934,1246];
        f=isolate(image,[xs[col],ys[row],xs[col+1]-xs[col],hs[row],(col+.5)*image.width/4-xs[col],hs[row]],14);
        f.scale=104/(image.height/4);
      } else {f=isolate(image,originals[name].rows[row][col],12);f.scale=originals[name].scale;}
      const w=Math.max(1,Math.round(f.w*f.scale*3)),h=Math.max(1,Math.round(f.h*f.scale*3));
      const normalized=createCanvas(w,h),ctx=normalized.getContext('2d');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(f.canvas,f.x,f.y,f.w,f.h,0,0,w,h);
      out.push({canvas:normalized,w,h,pivot:f.pivot*f.scale*3});
    }
    const cellW=Math.max(...out.map(f=>f.w))+16,cellH=Math.max(...out.map(f=>f.h))+16;
    const sheet=createCanvas(cellW*4,cellH*rows),ctx=sheet.getContext('2d'),meta=[];
    for(let row=0;row<rows;row++){
      const line=[];
      for(let c=0;c<4;c++){
        const f=out[row*4+c],x=c*cellW+8,y=row*cellH+8;
        ctx.drawImage(f.canvas,x,y);
        line.push([x,y,f.w,f.h,f.pivot,f.h]);
      }
      meta.push(line);
    }
    const output=name.replace('Detailed','_clean')+'.webp';
    fs.writeFileSync(path.join(root,output),sheet.toBuffer('image/webp',92));
    atlas[name]={scale:1/3,rows:meta};
  }
  process.stdout.write('window.ArenaAtlas = '+JSON.stringify(atlas,null,2)+';\n');
})();
