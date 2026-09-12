// Screen-space placement is independent from the world-space optical sample.
export function touchLoupePlacement(x: number, y: number, width: number, height: number) {
  const radius = Math.min(58, width/5, height/5);
  const margin = radius+12;
  const above = y-radius-42;
  return { x: Math.max(margin,Math.min(width-margin,x)), y: Math.max(margin,Math.min(height-margin,above>=margin?above:y+radius+42)), radius,
    visible: x>=0&&x<=width&&y>=0&&y<=height };
}
