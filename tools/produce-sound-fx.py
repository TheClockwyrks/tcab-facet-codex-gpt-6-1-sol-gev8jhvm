from pathlib import Path
exec((Path(__file__).resolve().parent / 'produce-art.py').read_text().split('# Scanline')[0])
for n,burst,speed,size,rate in [('clear',18,55,.7,0),('flaw',35,95,1.2,0),('cut',24,45,1,0),('aura',0,12,.35,12)]:
 c=cfg('fx',dict(width=128,height=128,duration_ms=1000,fps=30,seed=12,actions='/tmp/fxops.json',preview='/tmp/fx.png',system=f'{root}/fx/{n}.json'))
 run('particle-2d',c,'init');run('particle-2d',c,'add-emitter','--name','spark','--shape','disc','--radius',18 if rate else 2,'--x',0,'--y',0,'--rate' if rate else '--burst',rate or burst,'--lifetime',700 if rate else 450,'--speed',speed,'--cone-angle',180)
 run('particle-2d',c,'set-particle','--emitter','spark','--size-from',size,'--size-to',0,'--opacity-from',.8,'--opacity-to',0,'--color-gradient','#fff0b8@0,#75e8dd@1')
 if rate:run('particle-2d',c,'set-timeline','--loop','true')
 run('particle-2d',c,'render','--frame',4)
c=cfg('sample',dict(sample_rate=22050,channels='stereo',max_duration_ms=1000,seed=12,sample_pack='combat-core',actions='/tmp/sampleops.json',preview='/tmp/sample.png',wav=root+'/audio/shatter.wav'))
run('sfx-sample',c,'init');run('sfx-sample',c,'add-sample','--name','debris_glass','--t',0,'--gain',-18);run('sfx-sample',c,'render')
for n,tempo in [('title',100),('play',76)]:
 c=cfg('music',dict(sample_rate=22050,channels='stereo',max_duration_ms=26000,seed=4,instrument_bank='gm-lite',actions='/tmp/musicops.json',preview='/tmp/music.png',wav=root+'/audio/'+n+'.wav',mid=root+'/audio/'+n+'.mid'))
 run('music',c,'init');run('music',c,'set-tempo','--bpm',tempo)
 for name,inst in [('melody','music_box'),('bed','vibraphone'),('bass','marimba')]:run('music',c,'define-track','--name',name,'--instrument',inst)
 hook=[76,79,83,81,79,74,76,71,76,79,86,83,81,79,74,71]
 if n=='play':hook=[71,74,78,74,72,76,79,76,71,74,79,74,69,74,78,74]
 for i,p in enumerate(hook*2 if n=='title' else hook):run('music',c,'add-note','--track','melody','--pitch',p,'--t',i if n=='title' else i*2,'--dur',.65 if n=='title' else 1.4,'--velocity',65 if n=='title' else 42)
 for bar,base in enumerate([52,48,55,50,52,48,55,59]):
  run('music',c,'add-note','--track','bass','--pitch',base-12,'--t',bar*4,'--dur',2,'--velocity',58)
  for p in [base,base+7,base+12]:run('music',c,'add-note','--track','bed','--pitch',p,'--t',bar*4,'--dur',3.5,'--velocity',36)
 for track in ['melody','bed','bass']:run('music',c,'set-track-fx','--track',track,'--gain',-12,'--reverb',.18)
 run('music',c,'render')
