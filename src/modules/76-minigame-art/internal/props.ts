import { ArtBatch, type Point } from './geometry'

export const PROP_KINDS=['cypress','palm','pine','reeds','mushrooms','grave','lantern','crate','barrel','buoy','bench','cabinet','console','speaker','spotlight','trophy','pot','stove','cart','clock','pipes','gear','books','plant','desk','telescope','ruins','coral','shells','ice','snowman','tent','neon','skate','lifering','mailbox','hay','wheel','bomb','web','anchor','fountain','hedge','easel','target'] as const
export type PropKind=typeof PROP_KINDS[number]
export interface Palette {base:string;accent:string;light:string;dark:string;leaf:string}
const WOOD='#997452',PALE='#e9d6aa',IRON='#36434d',GOLD='#d3a353'
export function prop(b:ArtBatch,kind:PropKind,p:Palette){
  const box=(at:Point,size:Point,c=p.base)=>b.box(at,size,c)
  const feet=(w=1.4,d=.7,h=.7)=>{for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box([x,h/2,z],[.1,h,.1],IRON)}
  const rivets=(z:number,w=1.4,h=.8)=>{for(const x of [-w/2,w/2])for(const y of [.15,h])b.sphere([x,y,z],.045,GOLD)}
  const leaves=(y:number)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b.ball([Math.sin(a)*.38,y+.2,Math.cos(a)*.38],[.25,.65,.25],i%2?p.leaf:p.accent)}}
  switch(kind){
    case 'cypress':
      b.cylinder([0,1,0],.12,.22,2,WOOD)
      for(let i=0;i<3;i++)b.ball([i%2*.12,1.5+i*.65,0],[.65-i*.12,1,.65-i*.12],i%2?p.leaf:p.base)
      break
    case 'pine':
      b.cylinder([0,.7,0],.12,.2,1.4,WOOD)
      for(let i=0;i<3;i++)b.cone([0,1.3+i*.6,0],1-i*.23,1.7,i%2?p.leaf:p.base)
      break
    case 'palm':
      for(let i=0;i<5;i++)b.cylinder([i*i*.014,.32+i*.48,0],.17,.22,.5,i%2?WOOD:PALE)
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7;b.ball([.35+Math.sin(a)*.8,2.65,Math.cos(a)*.8],[.3,.12,1],p.leaf,[0,a,0]);}
      for(let i=0;i<3;i++)b.sphere([.1+i*.19,2.4,.15],.15,WOOD)
      break
    case 'reeds':
      for(let i=0;i<9;i++){const x=(i%3-1)*.23,z=(Math.floor(i/3)-1)*.25,h=.8+i%4*.23;b.cylinder([x,h/2,z],.025,.035,h,p.leaf);b.cylinder([x,h+.08,z],.065,.065,.3,WOOD);b.box([x+.12,h*.45,z],[.06,h*.65,.07],p.accent,[0,0,-.3])}
      break
    case 'mushrooms':
      for(let i=0;i<4;i++){const x=(i%2-.5)*.6,z=(Math.floor(i/2)-.5)*.55;b.cylinder([x,.2,z],.07,.1,.4,PALE);b.sphere([x,.43,z],.28,i%2?p.accent:p.base,[1,.5,1]);b.sphere([x-.08,.55,z],.04,PALE)}
      break
    case 'grave':
      box([0,.1,0],[1.3,.2,.85],p.dark);box([0,.7,-.15],[.8,1.1,.22]);b.cylinder([0,1.25,-.15],.4,.4,.22,p.base,[Math.PI/2,0,0]);box([0,.92,-.02],[.08,.4,.02],p.light);box([0,.99,-.02],[.35,.08,.02],p.light)
      for(let i=0;i<3;i++)box([0,.58-i*.11,-.02],[.45-i*.06,.025,.025],p.dark)
      b.ball([.45,.22,.25],[.28,.12,.26],p.leaf);break
    case 'lantern':
      b.cylinder([0,.08,0],.3,.4,.16,p.dark);b.cylinder([0,1,0],.06,.09,1.9,IRON,undefined,'metal')
      box([0,2.03,0],[.46,.55,.46],p.light);b.cone([0,2.43,0],.43,.35,IRON)
      for(const x of [-.25,.25])for(const z of [-.25,.25])box([x,2.04,z],[.045,.65,.045],IRON)
      b.sphere([0,2.05,0],.13,p.light);break
    case 'crate':
      box([0,.55,0],[1.2,1.1,1],WOOD)
      for(const z of [-.515,.515]){for(const x of [-.48,.48])box([x,.55,z],[.11,1.1,.07],PALE);for(const y of [.12,.98])box([0,y,z],[1.2,.1,.07],PALE);b.box([0,.55,z],[.1,1.15,.08],PALE,[0,0,.72]);rivets(z)}
      break
    case 'barrel':
      b.cylinder([0,.55,0],.43,.47,1.1,WOOD,undefined,'matte',12)
      for(const y of [.12,.9])b.cylinder([0,y,0],.48,.48,.09,IRON,undefined,'metal',12)
      b.cylinder([0,1.11,0],.4,.4,.04,PALE);b.sphere([.2,1.15,0],.06,IRON);break
    case 'buoy':
      b.cylinder([0,.2,0],.55,.7,.4,p.base);b.cone([0,.75,0],.4,.9,p.accent);b.ring([0,1.25,0],.12,.04,IRON);break
    case 'bench':
      feet(1.8,.5,.6);for(let i=0;i<3;i++)box([0,.62,-.3+i*.25],[2,.09,.2],WOOD)
      for(const y of [.9,1.15])box([0,y,-.4],[2,.18,.07],PALE)
      for(const x of [-.8,.8])box([x,.85,-.43],[.08,.8,.08],IRON);break
    case 'cabinet':
      box([0,.9,0],[1.35,1.8,.7],p.base);box([0,1.8,0],[1.5,.12,.8],p.light)
      for(const y of [.35,.85,1.35]){box([0,y,.37],[1.2,.4,.05],p.accent);box([0,y,.42],[.35,.05,.06],IRON)}rivets(.39,1.1,1.65);break
    case 'console':
      box([0,.65,0],[1.4,1.3,.85],p.base);b.box([0,1.4,-.1],[1.3,.95,.15],IRON,[-.24,0,0]);b.box([0,1.4,.004],[1.07,.64,.035],p.accent,[-.24,0,0],'glow')
      for(let i=0;i<5;i++){box([-.45+i*.22,1,.47],[.12,.08,.07],i%2?p.light:p.accent);box([-.4+i*.2,.45,.44],[.08,.22,.025],p.dark)}break
    case 'speaker':
      box([0,1,0],[1.1,2,.75],p.dark)
      for(const y of [.52,1.38]){b.cylinder([0,y,.39],.35,.35,.04,IRON,[Math.PI/2,0,0]);b.ring([0,y,.43],.25,.045,p.base,[0,0,0]);b.sphere([0,y,.46],.12,p.dark,[1,1,.25])}rivets(.4,.9,1.85);break
    case 'spotlight':
      feet(1.1,.7,.7);b.cylinder([0,1.05,0],.3,.4,.65,IRON,[.65,0,Math.PI/2],'metal');b.cylinder([-.3,1.05,.2],.28,.28,.04,p.light,[0,0,Math.PI/2],'glow');break
    case 'trophy':
      box([0,.12,0],[.9,.24,.75],p.dark);b.cylinder([0,.5,0],.1,.25,.6,GOLD,undefined,'metal');b.cylinder([0,1.07,0],.45,.18,.65,GOLD,undefined,'metal');for(const x of [-.45,.45])b.ring([x,1.05,0],.24,.055,GOLD,[0,0,0],'metal');b.sphere([0,1.48,0],.16,p.accent);break
    case 'plant':case 'pot':
      b.cylinder([0,.35,0],.4,.26,.7,p.base);b.cylinder([0,.69,0],.44,.44,.12,p.accent);b.cylinder([0,.75,0],.35,.35,.03,p.dark);leaves(.95);break
    case 'stove':
      box([0,.7,0],[1.55,1.4,1],p.light);box([0,.7,.515],[1.2,.75,.04],IRON);box([0,.73,.545],[.9,.5,.03],p.dark)
      box([0,1.15,.57],[1.08,.06,.09],GOLD);for(const x of [-.43,.43])for(const z of [-.25,.25])b.ring([x,1.42,z],.19,.04,IRON);for(const x of [-.5,0,.5])b.sphere([x,1.25,.55],.07,p.accent);break
    case 'cart':
      feet(1.7,.7,.9);box([0,.9,0],[2,.13,1],WOOD);box([0,.45,0],[1.7,.1,.8],p.base)
      for(const x of [-.8,.8])for(const z of [-.4,.4])b.cylinder([x,.16,z],.16,.16,.08,IRON,[Math.PI/2,0,0]);for(let i=0;i<5;i++)b.sphere([-.65+i*.32,1.12,0],.18,i%2?p.accent:p.leaf);break
    case 'clock':
      box([0,.12,0],[1.2,.24,.7],p.dark);box([0,.65,0],[.18,1.1,.16],WOOD);b.cylinder([0,1.6,0],.62,.62,.22,p.base,[Math.PI/2,0,0]);b.cylinder([0,1.6,.13],.53,.53,.025,p.light,[Math.PI/2,0,0]);box([0,1.78,.16],[.045,.35,.03],IRON);b.box([.17,1.53,.16],[.35,.045,.03],IRON,[0,0,-.4]);for(let i=0;i<12;i++){const a=i*Math.PI/6;box([Math.sin(a)*.44,1.6+Math.cos(a)*.44,.16],[.035,.055,.02],IRON)}break
    case 'pipes':
      for(let i=0;i<3;i++){const h=1+i*.4;b.cylinder([-.5+i*.5,h/2,0],.13,.13,h,p.base,undefined,'metal');b.ring([-.5+i*.5,h-.1,0],.14,.04,p.accent);b.cylinder([-.5+i*.5,h,.15],.13,.13,.3,IRON,[Math.PI/2,0,0],'metal')}break
    case 'gear':case 'wheel':
      b.cylinder([0,1,0],.8,.8,.22,p.base,[Math.PI/2,0,0],'metal');b.cylinder([0,1,.15],.16,.16,.18,p.dark,[Math.PI/2,0,0],'metal')
      for(let i=0;i<10;i++){const a=i*Math.PI/5;b.box([Math.sin(a)*.84,1+Math.cos(a)*.84,0],[.27,.3,.28],p.accent,[0,0,-a],'metal')}break
    case 'books':
      for(let i=0;i<5;i++)b.box([(i%2)*.1,.09+i*.17,0],[1,.14,.65],i%2?p.accent:p.base,[0,i*.13,0]);box([0,.96,0],[.8,.09,.5],PALE);break
    case 'desk':
      feet(1.8,.8,1);box([0,1,0],[2.1,.14,1.1],WOOD);box([-.7,.55,0],[.55,.9,.85],p.base);for(let i=0;i<3;i++)box([-.7,.3+i*.25,.45],[.22,.04,.04],GOLD);b.cylinder([.55,1.2,0],.14,.12,.3,p.light);box([-.1,1.09,.05],[.55,.02,.5],PALE);break
    case 'telescope':
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;b.box([Math.sin(a)*.3,.6,Math.cos(a)*.3],[.07,1.3,.07],WOOD,[Math.cos(a)*.45,0,-Math.sin(a)*.45])}
      b.cylinder([0,1.3,0],.22,.32,1.5,GOLD,[Math.PI/2-.35,0,0],'metal');b.cylinder([0,1.55,.73],.22,.22,.05,p.accent,[Math.PI/2-.35,0,0],'glow');break
    case 'ruins':
      for(const x of [-.65,.65]){box([x,.15,0],[.7,.3,.7],p.dark);b.cylinder([x,.9,0],.22,.3,1.4,p.base);box([x,1.62,0],[.6,.2,.6],p.light)}box([0,1.83,0],[2,.24,.7],p.base);b.ball([.7,.27,.55],[.3,.2,.35],p.leaf);break
    case 'coral':
      for(let i=0;i<5;i++){const x=(i-2)*.23;b.cylinder([x,.35+Math.abs(i-2)*.12,0],.07,.12,.8,p.accent,[0,0,(i-2)*.22]);b.sphere([x*1.5,.75+Math.abs(i-2)*.15,0],.14,p.base)}break
    case 'shells':
      for(let i=0;i<3;i++){const x=(i-1)*.45;b.sphere([x,.12,i%2*.3],.25,i%2?p.accent:PALE,[1,.45,.85]);for(let j=0;j<3;j++)b.box([x-.1+j*.1,.22,i%2*.3],[.025,.02,.28],p.light,[0,(j-1)*.3,0])}break
    case 'ice':
      for(let i=0;i<4;i++)b.ball([(i%2-.5)*.6,.4+i%3*.2,(Math.floor(i/2)-.5)*.5],[.5,.6+i%2*.4,.45],i%2?p.light:p.base);break
    case 'snowman':
      b.sphere([0,.5,0],.55,p.light);b.sphere([0,1.2,0],.38,p.light);b.cone([0,1.2,.4],.09,.35,p.accent,[Math.PI/2,0,0]);for(const x of [-.13,.13])b.sphere([x,1.32,.33],.04,IRON);b.cylinder([0,1.58,0],.42,.42,.07,IRON);b.cylinder([0,1.79,0],.26,.29,.4,IRON);box([0,.95,0],[.75,.13,.65],p.accent);break
    case 'tent':
      b.cylinder([0,.8,0],0,1.3,1.6,p.base,[0,Math.PI/4,0],'matte',4);box([0,.4,.92],[.5,.75,.03],p.dark);b.box([0,1,0],[.08,2.1,.08],WOOD,[0,0,.75]);break
    case 'neon':
      box([0,.15,0],[2.3,.3,.8],p.dark);for(const x of [-.8,.8])box([x,1.3,0],[.1,2.3,.12],IRON);box([0,2.2,0],[2.6,.95,.2],p.base);for(let i=0;i<5;i++)b.box([-.9+i*.45,2.2,.13],[.25,.5,.035],i%2?p.light:p.accent,[0,0,.22],'glow');break
    case 'skate':
      box([0,.25,0],[.65,.13,1.7],p.accent);for(const z of [-.6,.6]){box([0,.15,z],[.85,.08,.09],IRON);for(const x of [-.42,.42])b.cylinder([x,.15,z],.14,.14,.12,p.light,[0,0,Math.PI/2])}b.box([0,.25,-.9],[.65,.12,.25],p.accent,[-.28,0,0]);break
    case 'lifering':
      b.ring([0,.7,0],.5,.12,p.light,[0,0,0]);for(let i=0;i<4;i++){const a=i*Math.PI/2;b.box([Math.sin(a)*.5,.7+Math.cos(a)*.5,0],[.2,.2,.25],p.accent,[0,0,-a])}break
    case 'mailbox':
      box([0,.65,0],[.14,1.3,.14],WOOD);box([0,1.4,0],[.65,.6,.9],p.base);box([0,1.4,.46],[.5,.035,.025],p.dark);box([.4,1.65,0],[.06,.45,.06],IRON);box([.5,1.85,0],[.25,.2,.08],p.accent);break
    case 'hay':
      box([0,.4,0],[1.5,.8,.85],p.base);for(const x of [-.5,.5])box([x,.41,0],[.06,.84,.9],WOOD);for(let i=0;i<8;i++)box([-.63+i*.18,.81,0],[.035,.03,.8],p.light);break
    case 'bomb':
      b.sphere([0,.6,0],.6,p.dark);b.cylinder([0,1.2,0],.16,.2,.18,IRON,undefined,'metal');b.box([.12,1.45,0],[.08,.4,.08],WOOD,[0,0,-.5]);b.ball([.22,1.65,0],[.18,.18,.12],p.accent);break
    case 'web':
      for(let i=0;i<7;i++){const a=i*Math.PI/3.5;b.box([0,1.2,0],[.025,2.1,.025],p.light,[0,0,a])}for(const r of [.35,.65,1])b.ring([0,1.2,0],r,.015,p.light,[0,0,0]);b.sphere([.45,.8,.05],.17,p.dark);break
    case 'anchor':
      box([0,.9,0],[.12,1.6,.14],p.base);b.ring([0,1.8,0],.2,.06,p.base,[0,0,0],'metal');box([0,1.2,0],[1.2,.12,.14],p.base);b.ring([0,.7,0],.65,.09,p.base,[0,0,0],'metal');box([0,.72,.01],[1.5,.75,.2],p.dark);break
    case 'fountain':
      b.cylinder([0,.15,0],1.1,1.15,.3,p.base,undefined,'matte',16);b.cylinder([0,.32,0],.96,.96,.03,p.accent,undefined,'metal',16);b.cylinder([0,.8,0],.16,.32,1.2,p.light);b.cylinder([0,1.35,0],.65,.2,.25,p.base);b.sphere([0,1.6,0],.15,p.accent);break
    case 'hedge':
      box([0,.17,0],[1.6,.34,.7],p.base);for(let i=0;i<3;i++)b.ball([-.5+i*.5,.65,0],[.6,.6,.5],i%2?p.leaf:p.accent);break
    case 'easel':
      for(const x of [-.5,.5])b.box([x,.9,0],[.08,1.9,.08],WOOD,[0,0,-x*.3]);box([0,.62,.05],[1.4,.08,.22],WOOD);box([0,1.27,.03],[1.2,1.1,.1],PALE);b.ball([-.2,1.4,.1],[.25,.23,.02],p.accent);b.ball([.2,1.1,.1],[.3,.2,.02],p.leaf);break
    case 'target':
      feet(1,.6,1);for(let i=0;i<3;i++)b.cylinder([0,1.2,.02+i*.03],.65-i*.2,.65-i*.2,.04,i%2?p.light:p.accent,[Math.PI/2,0,0]);break
  }
}
