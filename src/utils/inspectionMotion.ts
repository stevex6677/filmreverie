export type Point3 = [number, number, number];
/** Cubic Hermite flight: retarget from rendered position AND velocity. */
export class InspectionMotion {
  position: Point3;
  velocity: Point3 = [0,0,0];
  private start: Point3;
  private initialVelocity: Point3 = [0,0,0];
  private end: Point3;
  private elapsed = 0;
  private duration = .45;
  private lift = 0;
  done = true;
  constructor(position: Point3) { this.position=[...position];this.start=[...position];this.end=[...position]; }
  retarget(end: Point3, stripDistance: number, duration?: number) {
    this.start=[...this.position];this.initialVelocity=[...this.velocity];this.end=[...end];this.elapsed=0;
    this.duration=duration ?? (stripDistance>1?.85:stripDistance===1?.55:.4);
    this.lift=stripDistance>1?Math.min(.45,Math.hypot(end[0]-this.start[0],end[2]-this.start[2])*.2):0;
    this.done=false;
  }
  step(dt: number) {
    this.elapsed=Math.min(this.duration,this.elapsed+Math.max(0,dt));const t=this.elapsed/this.duration,d=this.duration;
    for(let i=0;i<3;i++){
      this.position[i]=(2*t**3-3*t*t+1)*this.start[i]+(t**3-2*t*t+t)*d*this.initialVelocity[i]+(-2*t**3+3*t*t)*this.end[i];
      this.velocity[i]=((6*t*t-6*t)*this.start[i]+(3*t*t-4*t+1)*d*this.initialVelocity[i]+(-6*t*t+6*t)*this.end[i])/d;
    }
    this.position[1]+=this.lift*Math.sin(Math.PI*t)**2;
    this.velocity[1]+=this.lift*Math.PI*Math.sin(2*Math.PI*t)/d;
    this.done=t===1;return this.position;
  }
}
