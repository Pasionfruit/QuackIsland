import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const root='src/modules'
export const games=fs.readdirSync(root).filter(id=>{const n=Number(id.slice(0,2));return n>=16&&n<=51||[58,61,64,65,67,69,70,71,72,73].includes(n)})
export const scenes={}
for(const id of games){
 const folder=path.join(root,id,'internal')
 const candidates=fs.readdirSync(folder).filter(f=>/Scene\.tsx$/.test(f)||['Stage.tsx','Marsh.tsx','Arena.tsx'].includes(f))
 for(const file of candidates){
  const filename=path.join(folder,file),source=fs.readFileSync(filename,'utf8'),ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const functions=ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))
  const fn=functions.find(f=>/Scene$/.test(f.name?.text??''))??functions.find(f=>['Stage','Marsh','Arena'].includes(f.name?.text??''))
  if(!fn)continue
  const returns=fn.body.statements.filter(s=>ts.isReturnStatement(s))
  let jsx=returns.at(-1)?.expression
  while(jsx&&ts.isParenthesizedExpression(jsx))jsx=jsx.expression
  scenes[id]={filename,component:fn.name.text,root:jsx&&ts.SyntaxKind[jsx.kind],start:jsx?.getStart(ast),end:jsx?.end}
 }
 if(process.argv.includes('--print')){
  const doc=fs.readFileSync(path.join(root,id,'MODULE.md'),'utf8').split('\n').slice(0,16).filter(l=>l.trim()&&!l.startsWith('#')).join(' ').slice(0,220)
  console.log(id,JSON.stringify(scenes[id]),doc)
  const dimensions=[]
  for(const file of fs.readdirSync(folder).filter(f=>/^(arena|rules|course|track|layout|place|camera|field|geometry)\.ts$/.test(f))){
   const lines=fs.readFileSync(path.join(folder,file),'utf8').split('\n')
   dimensions.push(...lines.filter(l=>/\b(width|depth|length|halfWidth|halfDepth|halfLength|edge|size|HALF_W|HALF_H|HALF_WIDTH|HALF_LENGTH|EDGE|HALF|span)\b\s*[:=]\s*[\d{]/.test(l)).slice(0,10).map(l=>file+': '+l.trim()))
  }
  console.log(dimensions.slice(0,12).join(' | '))
 }
}
