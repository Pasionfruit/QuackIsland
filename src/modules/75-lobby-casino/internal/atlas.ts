import { CanvasTexture, SRGBColorSpace } from 'three'
import { CONVENTIONS, createRng } from '../../00-core'

export const ATLAS_SIZE=1024
export const ATLAS_RECTS=[
  [0,0,512,320],[512,0,512,320],[0,320,512,320],[512,320,512,320],
  [0,640,512,320],[512,640,512,160],
  ...Array.from({length:4},(_,i)=>[512+i*128,800,128,160]),
] as const

/** All felt printing, card faces and reel symbols are drawn locally, in one atlas. */
export function casinoAtlas():CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=ATLAS_SIZE;canvas.height=ATLAS_SIZE
  const ctx=canvas.getContext('2d')
  if(!ctx)throw Error('Casino graphics require a 2D canvas')
  const cream='#f1e6c9',gold='#d6b87c',red='#b94e48',dark='#263630'
  const cell=(i:number,draw:(c:CanvasRenderingContext2D)=>void)=>{
    const [x,y,w,h]=ATLAS_RECTS[i]
    ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip()
    ctx.fillStyle=cream;ctx.strokeStyle=gold;ctx.lineWidth=2;ctx.textAlign='center';ctx.textBaseline='middle'
    draw(ctx);ctx.restore()
  }
  const title=(c:CanvasRenderingContext2D,text:string)=>{c.font='bold 35px Georgia';c.fillStyle=gold;c.fillText(text,256,30)}
  cell(0,c=>{
    title(c,'BLACKJACK')
    c.font='22px Georgia';c.fillStyle=cream;c.fillText('BLACKJACK PAYS 3 : 2',256,85)
    c.font='17px Georgia';c.fillText('DEALER STANDS ON 17',256,121)
    for(let i=0;i<5;i++){c.beginPath();c.ellipse(54+i*101,215,32,55,0,0,Math.PI*2);c.stroke()}
    c.font='16px Georgia';c.fillText('ISLAND CLUB',256,294)
  })
  cell(1,c=>{
    title(c,'ROULETTE')
    const reds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
    c.fillStyle='#42825e';c.fillRect(4,65,28,198);c.strokeRect(4,65,28,198)
    c.font='bold 20px Georgia';c.fillStyle=cream;c.fillText('0',18,164)
    for(let column=0;column<12;column++)for(let row=0;row<3;row++){
      const n=column*3+row+1,x=34+column*39,y=65+row*66
      c.fillStyle=reds.has(n)?red:dark;c.fillRect(x,y,39,66);c.strokeRect(x,y,39,66)
      c.fillStyle=cream;c.font='bold 20px Georgia';c.fillText(String(n),x+19.5,y+33)
    }
    c.font='20px Georgia';c.fillText('EVEN    RED    BLACK    ODD',266,294)
  })
  cell(2,c=>{
    c.fillStyle='#ece2cb';c.fillRect(0,0,512,320)
    const rng=createRng(CONVENTIONS.worldSeed^0x5245454c)
    for(let col=0;col<5;col++)for(let row=0;row<3;row++){
      const x=col*102.4,y=row*106.6
      c.strokeStyle='#b49a66';c.lineWidth=3;c.strokeRect(x+3,y+3,96,100)
      const symbol=Math.floor(rng()*4),cx=x+51,cy=y+54
      if(symbol===0){
        c.fillStyle=red
        for(const shift of [-13,13]){c.beginPath();c.arc(cx+shift,cy+10,15,0,Math.PI*2);c.fill()}
        c.strokeStyle='#54834c';c.lineWidth=5;c.beginPath();c.moveTo(cx-13,cy-1);c.lineTo(cx,cy-29);c.lineTo(cx+13,cy-1);c.stroke()
      }else if(symbol===1){c.fillStyle=red;c.font='bold 72px Georgia';c.fillText('7',cx,cy)}
      else if(symbol===2){
        c.fillStyle='#c9983e';c.beginPath()
        for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?13:30;const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;if(i===0)c.moveTo(px,py);else c.lineTo(px,py)}
        c.closePath();c.fill()
      }else{c.fillStyle=dark;c.fillRect(cx-35,cy-20,70,40);c.fillStyle=cream;c.font='bold 24px Georgia';c.fillText('BAR',cx,cy)}
    }
    c.strokeStyle='#bc8d39';c.lineWidth=2;c.beginPath();c.moveTo(0,160);c.lineTo(512,160);c.stroke()
  })
  cell(3,c=>{
    title(c,'BACCARAT')
    c.strokeRect(20,70,224,175);c.strokeRect(268,70,224,175)
    c.font='bold 28px Georgia';c.fillStyle=cream;c.fillText('PLAYER',132,107);c.fillText('BANKER',380,107)
    for(const x of [75,139,323,387])c.strokeRect(x,141,49,75)
    c.font='22px Georgia';c.fillText('TIE',256,282)
  })
  cell(4,c=>{
    title(c,'CRAPS')
    c.font='bold 25px Georgia'
    for(const [i,n]of[4,5,6,8,9,10].entries()){c.strokeRect(36+i*73,62,73,48);c.fillText(String(n),72+i*73,86)}
    c.font='bold 40px Georgia';c.fillText('COME',256,155)
    c.font='25px Georgia';c.fillText('FIELD  2  3  4  9  10  11  12',256,214)
    c.strokeRect(16,252,480,54);c.font='bold 30px Georgia';c.fillText('PASS LINE',256,280)
  })
  cell(5,c=>{
    c.fillStyle=dark;c.fillRect(0,0,512,160);c.strokeRect(8,8,496,144)
    c.fillStyle=gold;c.font='bold 50px Georgia';c.fillText('ISLAND CLUB',256,58)
    c.fillStyle=cream;c.font='25px Georgia';c.fillText('F I V E   R E E L S',256,113)
  })
  for(const [i,rank,suit]of [[6,'A','♠'],[7,'K','♥'],[8,'7','♦'],[9,'9','♣']] as const)cell(i,c=>{
    c.fillStyle='#f4eedf';c.fillRect(0,0,128,160);c.strokeStyle='#c4b99e';c.strokeRect(2,2,124,156)
    c.fillStyle=suit==='♥'||suit==='♦'?red:dark;c.font='bold 34px Georgia';c.fillText(rank,25,29)
    c.font='64px Georgia';c.fillText(suit,70,95)
  })
  const texture=new CanvasTexture(canvas);texture.name='island-casino-atlas';texture.colorSpace=SRGBColorSpace
  return texture
}
