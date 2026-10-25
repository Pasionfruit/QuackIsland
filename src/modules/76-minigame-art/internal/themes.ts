import type { Palette, PropKind } from './props'
export interface ArtDirection {
  name:string
  palette:Palette
  props:readonly [PropKind,PropKind,PropKind,PropKind]
  /** Clear gameplay rectangle. Decorations stay outside this envelope. */
  halfWidth:number
  halfDepth:number
  center?:readonly [number,number,number]
  scale?:number
}
const make=(name:string,w:number,d:number,props:ArtDirection['props'],base:string,accent:string,leaf='#64846a',center?:ArtDirection['center'],scale=1):ArtDirection=>({name,halfWidth:w,halfDepth:d,props,palette:{base,accent,leaf,light:'#eadfc2',dark:'#293643'},center,scale})
export const ART_DIRECTIONS={
 'zombie-tag':make('Moonlit memorial garden',22,14,['cypress','grave','mushrooms','lantern'],'#737d8a','#b18d67','#3e5d50'),
 'messy-maze':make('Forgotten garden labyrinth',18,18,['ruins','hedge','clock','lantern'],'#a0af9b','#b7bd70','#587d66'),
 'probable-stop':make('Alpine rope-bridge expedition',10,14.5,['pine','crate','telescope','lantern'],'#6c8e84','#d9b278','#527467',[0,0,-5]),
 'duck-hunt':make('Balloon field fairground',18,12,['tent','target','cart','neon'],'#d68e6b','#e5bd70','#719270'),
 'punch-buggy':make('Offshore training club',9,9,['buoy','lifering','target','barrel'],'#699caf','#ec9c6b'),
 'i-see-the-light':make('Seaside athletics meeting',9,15,['clock','bench','trophy','target'],'#6c9697','#dca36f'),
 'let-him-cook':make('Country kitchen',8,4,['stove','cart','pot','cabinet'],'#8aada0','#db9770','#60866d',undefined,.8),
 'lady-luck':make('Clover conservatory',10,7,['fountain','mushrooms','pot','bench'],'#91a789','#d7b875','#61866a',undefined,.65),
 'make-the-cut':make('Suspended bell tower',10,10,['ruins','lantern','gear','books'],'#b3a18a','#d4b975'),
 'wack-attack':make('Orchard county fair',12,12,['hay','cart','mushrooms','mailbox'],'#c5a16b','#d89065','#71975e'),
 'sprint-triathlon':make('Island triathlon resort',20,11,['palm','buoy','bench','trophy'],'#7da8a3','#e6b56e','#629873'),
 'find-yourself':make('Velvet shell-game parlour',10,3,['cabinet','desk','books','trophy'],'#816b87','#d8b67b',undefined,undefined,.65),
 'feeding-time':make('Waterside picnic garden',13,9,['reeds','bench','cart','lifering'],'#7f9d8d','#e1ba82','#699269'),
 'time-it':make('Brass stopwatch observatory',8,5,['clock','telescope','books','gear'],'#8e8580','#cfa66b',undefined,undefined,.8),
 'synchronize-steps':make('Mountain monastery stairs',12,7,['ruins','pine','clock','lantern'],'#8a9d9f','#c4ac83'),
 'helping-dad':make('Midnight workshop',15,12,['pipes','crate','cabinet','lantern'],'#63757d','#b49a70',undefined,undefined,.8),
 'hes-one-shot':make('Cargo-yard skirmish',22,22,['crate','barrel','spotlight','console'],'#778b83','#d1a477'),
 'keyboard-warrior':make('Retro typing arcade',8,5,['neon','console','books','speaker'],'#6c718e','#cf90a8',undefined,undefined,.8),
 'sharing-is-caring':make('Overgrown royal courtyard',10,10,['ruins','fountain','trophy','plant'],'#a5a189','#c9ad68','#6c8d76'),
 'chef-caricature':make('Artist kitchen studio',7,3,['easel','cart','stove','books'],'#92aaa1','#dca889',undefined,undefined,.7),
 'musical-mayhem':make('Sunset beach club',6,6,['speaker','neon','spotlight','palm'],'#93778b','#dfac80','#668d7c',undefined,.75),
 'wheres-midnight':make('Moonlit salvage yard',18,18,['barrel','pipes','crate','lantern'],'#596870','#b1976c','#52675b'),
 'pet-race':make('Country pet derby',14,92,['hay','bench','trophy','target'],'#a0aa7e','#d9ac76','#75946b',[0,0,-90]),
 'ill-just-wait':make('Clockmaker reading room',8,5,['clock','books','gear','desk'],'#7d8d86','#cfb280',undefined,undefined,.8),
 'whats-your-rpm':make('Neon scrolling lounge',10,9,['console','neon','speaker','plant'],'#7c7693','#d79daf',undefined,undefined,.8),
 'i-just-work-here':make('Lived-in coastal office',20,16,['desk','books','plant','mailbox'],'#8faaa1','#cdb28d'),
 'highest-in-the-room':make('Cloud observatory',30,4,['ruins','telescope','clock','neon'],'#9eabb4','#d3b784'),
 'color-coded':make('Chromatic carnival',10,10,['target','neon','speaker','trophy'],'#7c88aa','#dba3a3'),
 'binary-bs':make('Brass logic engine',12,12,['gear','pipes','console','clock'],'#8d9b95','#cbb17b'),
 'youre-the-bomb':make('Civil-defence control room',12,20,['console','pipes','barrel','spotlight'],'#82968a','#cca876'),
 'shanty-matrix':make('Weathered pirate quarterdeck',10,9,['anchor','barrel','crate','telescope'],'#967d66','#c6b080'),
 'spidey-senses':make('Forgotten attic menagerie',9,9,['web','books','grave','mushrooms'],'#797d84','#b4a286','#697e71'),
 'needs-a-walmart':make('Neighbourhood market',20,16,['cart','cabinet','plant','mailbox'],'#95b0a4','#d6aa82'),
 'milf-fishing':make('Quiet fishing cove',12,8,['reeds','lifering','barrel','bench'],'#7f9c9a','#dbb77c','#6a917d'),
 'perfect-game':make('Coral bowling beach',18,10,['palm','shells','coral','buoy'],'#88aeb1','#dfa68a','#6e9a7a'),
 'breaking-the-ice':make('Arctic research outpost',12,12,['snowman','ice','buoy','lantern'],'#8fb8ca','#d9997e','#7c9ba2',[0,-3,0]),
 'op-finder':make('Verification research lab',12,6,['console','books','plant','telescope'],'#93a9ab','#c8af8c',undefined,undefined,.8),
 'jackal':make('Mountain watchtower range',17,58,['crate','target','pine','telescope'],'#93a18d','#c8ad7a'),
 'big-backs-are-near':make('Harvest moon cornfield',45,45,['hay','pine','barrel','lantern'],'#aaa16c','#c6a477','#75845c'),
 'mama-tank':make('Desert tank proving ground',40,40,['barrel','crate','gear','spotlight'],'#a7a18b','#c3a172','#849281'),
 'trust-me-bro':make('Shipwreck treasure trial',9,5,['palm','anchor','barrel','crate'],'#8ba8a2','#d5b57f','#6b957a',undefined,.75),
 'duck-szn':make('Misty marsh hunting lodge',24,24,['reeds','pine','buoy','tent'],'#8c9e88','#c3a97c','#739175'),
 'me-in-team':make('Island expedition basecamp',14,25,['tent','crate','lantern','bench'],'#98b0a1','#d0af7a'),
 'tug-of-war':make('Tropical regatta club',9,9,['palm','buoy','barrel','lifering'],'#8aada9','#d9b183','#699d7b',undefined,.75),
 'aura-debt':make('After-hours skate arcade',6.5,32,['skate','neon','console','barrel'],'#546b82','#b9ce83','#748e8c',[0,0,-26],.9),
} as const satisfies Record<string,ArtDirection>
export type MinigameArtId=keyof typeof ART_DIRECTIONS
