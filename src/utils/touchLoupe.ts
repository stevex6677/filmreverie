// Screen-space placement is independent from the world-space optical sample.
export function touchLoupePlacement(x: number, y: number, width: number, height: number, requestedRadius = Math.min(58,width/5,height/5)) {
  let radius=Math.max(1,Math.min(requestedRadius,Math.min(width,height)/2-12));
  const visible=x>=0&&x<=width&&y>=0&&y<=height;
  // Prefer above the finger, then below or beside it. At extreme zoom, reduce
  // only as much as needed to keep both the lens and sampling point usable.
  for(let attempt=0;attempt<40;attempt++) {
    const margin=radius+12,gap=radius+42;
    const clamp=(px:number,py:number)=>({x:Math.max(margin,Math.min(width-margin,px)),y:Math.max(margin,Math.min(height-margin,py))});
    const candidates=[[x,y-gap],[x,y+gap],[x+gap,y],[x-gap,y],[0,0],[width,0],[0,height],[width,height]].map(([px,py])=>clamp(px,py));
    const placement=candidates.find(p=>Math.hypot(p.x-x,p.y-y)>=radius+28);
    if(placement||!visible||radius<=4)return {...(placement??candidates[0]),radius,visible};
    radius*=.9;
  }
  return {x:width/2,y:height/2,radius,visible:false};
}
