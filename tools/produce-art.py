import json,os,subprocess,math,colorsys
from pathlib import Path
root=str(Path(__file__).resolve().parents[1] / 'public' / 'assets')

def run(tool,c,*args):
 p=subprocess.run([tool,'--config',c,*map(str,args)],capture_output=True,text=True)
 if p.returncode: raise Exception(p.stderr+p.stdout)
def cfg(name,data):
 p='/tmp/'+name+'.json';json.dump(data,open(p,'w'));return p
# Scanline polygons are authored draw operations, rasterized by draw.
def poly(ops,pts,color):
 for y in range(max(0,int(min(p[1] for p in pts))),min(64,int(max(p[1] for p in pts))+1)):
  xs=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   if min(a[1],b[1])<=y<max(a[1],b[1]):xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  xs.sort()
  for a,b in zip(xs[::2],xs[1::2]):ops.append(dict(op='line',x0=round(a),y0=y,x1=round(b),y1=y,color=color))
def line(o,a,b,c):o.append(dict(op='line',x0=round(a[0]),y0=round(a[1]),x1=round(b[0]),y1=round(b[1]),color=c))
def hue(h,l):return '#'+''.join(f'{round(v*255):02x}' for v in colorsys.hls_to_rgb(h,l,.72))+'ff'
shapes=[[(32,5),(52,20),(48,46),(32,58),(12,44),(10,20)],[(20,6),(44,6),(58,32),(44,57),(20,57),(6,32)],[(32,3),(57,32),(32,60),(7,32)],[(18,8),(46,8),(55,20),(51,48),(32,58),(13,48),(9,20)],[(22,5),(42,5),(56,19),(56,43),(42,57),(22,57),(8,43),(8,19)],[(32,4),(57,22),(49,51),(15,51),(7,22)],[(23,5),(42,9),(55,29),(44,54),(21,58),(8,34)]]
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst'];hs=[.97,.07,.14,.40,.50,.63,.77]
def stone(k,s,rot=0):
 o=[];pts=shapes[k]; h=hs[k]
 for i,(a,b) in enumerate(zip(pts,pts[1:]+pts[:1])):poly(o,[a,b,(32,29)],hue(h,.25+(i%4)*.12))
 inner=[(32+(x-32)*.58,30+(y-30)*.58) for x,y in pts];poly(o,inner,hue(h,.61))
 for j in range(len(inner)):
  poly(o,[inner[j],inner[(j+1)%len(inner)],(31,29)],hue(h,[.66,.58,.45,.37,.49,.72,.64,.60][j]))
 for i in range(len(pts)):line(o,pts[i],inner[i],hue(h,.72 if i<3 else .38))
 for a,b in zip(inner,inner[1:]+inner[:1]):line(o,a,b,hue(h,.81))
 line(o,(19,20),(29,12),'#ffffffd0');line(o,(18,21),(18,25),'#ffffffa0')
 cracks=[[(30,7),(26,24),(36,34),(29,56)],[(10,32),(26,24),(44,20),(51,15)],[(36,34),(49,43),(53,48)]]
 for c in cracks[:s]:
  for a,b in zip(c,c[1:]):
   line(o,(a[0]+1,a[1]),(b[0]+1,b[1]),'#f3ecdfff' if s==3 else '#9ebfc0ff');line(o,a,b,'#131725ff')
 if s==3:
  for a,b in zip(pts,pts[1:]+pts[:1]):line(o,a,b,'#ffe9b5ff')
 return o
def emit(path,ops,w=64,h=64,tool='draw'):
 if '/break/' in path or 'prism-turn/' in path: tool='draw-sheet'
 os.makedirs(os.path.dirname(root+'/'+path),exist_ok=True); log='/tmp/ops.json';json.dump(ops,open(log,'w')); c=cfg('render',dict(width=w,height=h,background='#00000000',actions=log,preview=root+'/'+path));run(tool,c,'render','--actions',log,'--out',root+'/'+path,'--width',w,'--height',h)
for k,n in enumerate(names):
 for s in range(4):emit('gems/'+n+f'-{s}.png',stone(k,s))
 # break fragments move away from center, then shrink
 for f in range(6):
  o=[]
  for j in range(8):
   a=j*math.pi/4;d=f*4;cx=32+math.cos(a)*(12+d);cy=32+math.sin(a)*(12+d)+f*f*.35;r=max(1,9-f)
   poly(o,[(cx-r,cy-r/2),(cx+r,cy-r),(cx+r/2,cy+r)],hue(hs[k],.45+j%3*.15))
  emit(f'gems/break/{n}/{f}.png',o)
for s in range(4):
 o=[]
 for j in range(8):
  a=j*math.pi/4;b=(j+1)*math.pi/4;poly(o,[(32,32),(32+27*math.cos(a),32+27*math.sin(a)),(32+27*math.cos(b),32+27*math.sin(b))],hue(j/8,.72))
 for j in range(s):
  chain=[[(30,6),(26,22),(36,35),(27,57)],[(7,32),(26,22),(48,16)],[(36,35),(48,44),(54,47)]][j]
  for a,b in zip(chain,chain[1:]):
   line(o,(a[0]+1,a[1]),(b[0]+1,b[1]),'#ffffffff');line(o,a,b,'#132332ff')
 if s==3:
  pts=[(32+27*math.cos(j*math.pi/4),32+27*math.sin(j*math.pi/4)) for j in range(8)]
  for a,b in zip(pts,pts[1:]+pts[:1]):line(o,a,b,'#fff0b8ff')
 emit(f'gems/prism-{s}.png',o)
for f in range(8):
 o=[]
 for j in range(8):
  a=(j+f/8)*math.pi/4;b=a+math.pi/4;poly(o,[(32,32),(32+27*math.cos(a),32+27*math.sin(a)),(32+27*math.cos(b),32+27*math.sin(b))],hue((j+f/8)/8,.72))
 emit(f'gems/prism-turn/{f}.png',o)
for n in ['brilliant','star']:
 o=[]
 if n=='brilliant':
  for r in [23,25]:
   pts=[(32+r*math.cos(j*math.pi/4),32+r*math.sin(j*math.pi/4)) for j in range(8)]
   for a,b in zip(pts,pts[1:]+pts[:1]):line(o,a,b,'#fff3bdff')
 else:
  for a,b in [((32,5),(32,59)),((5,32),(59,32)),((13,13),(51,51)),((51,13),(13,51))]:line(o,a,b,'#fff5cbff')
  poly(o,[(32,18),(36,28),(46,32),(36,36),(32,46),(28,36),(18,32),(28,28)],'#fff5cbff')
 emit('gems/'+n+'.png',o)
# intricate frame made at full board dimensions
ops=[]
for inset,color in [(0,'#1a3038ff'),(2,'#a79a71ff'),(4,'#3f5960ff'),(9,'#101e29ff'),(12,'#455958ff')]:
 ops.append(dict(op='stroke_rect',x=inset,y=inset,width=608-inset*2,height=608-inset*2,color=color))
for x in range(16,592,72):
 for y in range(16,592,72):ops.append(dict(op='stroke_rect',x=x,y=y,width=72,height=72,color='#23343dff'))
emit('gems/board.png',ops,608,608)
# sound synthesis
for i,n in enumerate(['select','swap','refuse','land','flaw','cut','levelup','gameover']+[f'clear-{j}' for j in range(1,9)]):
 path=root+'/audio';os.makedirs(path,exist_ok=True)
 c=cfg('sound',dict(sample_rate=22050,channels='stereo',max_duration_ms=1100,seed=8,actions='/tmp/soundops.json',preview='/tmp/sound.png',wav=f'{path}/{n}.wav'))
 run('sfx-synth',c,'init');freq=[980,660,110,90,260,1320,880,220][min(i,7)] if i<8 else 440*2**((i-8)*2/12)
 run('sfx-synth',c,'add-voice','--name','tone','--wave','sine','--freq',freq,'--gain',-15,'--dur',120 if i<6 else 450)
 run('sfx-synth',c,'add-voice','--name','over','--wave','triangle','--freq',freq*2.01,'--gain',-27,'--dur',80 if i<6 else 300)
 
 if n in ['swap','refuse','land','flaw','gameover']:
  run('sfx-synth',c,'set-pitch','--voice','tone','--slide-to',freq*(1.6 if n=='swap' else .4),'--over',200)
 if n in ['refuse','land','flaw']:
  run('sfx-synth',c,'add-voice','--name','crack','--wave','noise','--gain',-24,'--dur',45 if n=='flaw' else 85)
 for voice in ['tone','over']:run('sfx-synth',c,'set-envelope','--voice',voice,'--env','pluck')
 if n in ['cut','levelup']:
  for j,ratio in enumerate([1.25,1.5,2]):run('sfx-synth',c,'add-voice','--name',f'chime{j}','--wave','sine','--freq',freq*ratio,'--gain',-23,'--start',j*65,'--dur',300)
 run('sfx-synth',c,'render')
