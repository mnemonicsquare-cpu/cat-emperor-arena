// Inspect alpha without changing artwork. Explicit gutters keep adjacent swords
// out of a frame; feet are measured independently from the image/cell bottom.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const specs = {
  catDetailed: {file:'cat_emperor_detailed.webp', height:74,
    y:[0,252,497,744,1002,1244,1536],
    x:[[0,256,512,768,1024],[0,268,522,776,1024],[0,266,526,786,1024],
      [0,256,512,800,1024],[0,256,506,800,1024],[0,246,492,728,1024]]},
  mouseDetailed: {file:'cultist_mouse_detailed.webp', height:60,
    y:[0,325,615,950,1254],
    x:[[0,314,628,942,1254],[0,324,634,946,1254],[0,314,624,926,1254],[0,314,602,908,1254]]},
  sorcererDetailed: {file:'sorcerer_mouse_detailed.webp', height:86,
    y:[0,375,744,1086],
    x:[[0,362,724,1086,1448],[0,362,708,1126,1448],[0,362,690,1040,1448]]}
};
(async () => {
  const atlas = {};
  for (const [name,spec] of Object.entries(specs)) {
    const image = await loadImage(path.join(__dirname,'../dist/assets/sprites',spec.file));
    const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    const rows=[];
    for(let r=0;r<spec.y.length-1;r++) {
      const row=[];
      for(let c=0;c<4;c++) {
        let left=image.width,top=image.height,right=0,bottom=0;
        for(let y=spec.y[r];y<spec.y[r+1];y++) for(let x=spec.x[r][c];x<spec.x[r][c+1];x++) {
          if(pixels[(y*image.width+x)*4+3]<128)continue;
          left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
        }
        if(right<=left||bottom<=top)throw Error(`Empty frame ${name} ${r} ${c}`);
        row.push([left,top,right-left,bottom-top,(c+.5)*image.width/4-left,bottom-top]);
      }
      rows.push(row);
    }
    const baseHeight=rows[0].reduce((sum,f)=>sum+f[3],0)/4;
    atlas[name]={scale:spec.height/baseHeight,rows};
  }
  process.stdout.write('window.ArenaAtlas = '+JSON.stringify(atlas,null,2)+';\n');
})();
