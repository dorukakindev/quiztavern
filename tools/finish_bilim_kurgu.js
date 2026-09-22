const fs=require('fs');
const source=JSON.parse(fs.readFileSync('new-classic-bilim.json','utf8'));
const base=source.filter((q)=>q.category==='Bilim Kurgu');
const scienceOnly=source.filter((q)=>q.category==='Bilim');
const extra=[
['frankenstein-yazari','Frankenstein romanının yazarı kimdir?','Who wrote Frankenstein?','Mary Shelley',['H. G. Wells','Jules Verne','Isaac Asimov']],
['dune-yazari','Dune romanının yazarı kimdir?','Who wrote Dune?','Frank Herbert',['Arthur C. Clarke','Philip K. Dick','Ursula K. Le Guin']],
['foundation-yazar','Foundation serisinin yazarı kimdir?','Who wrote the Foundation series?','Isaac Asimov',['Ray Bradbury','Robert Heinlein','William Gibson']],
['neuromancer-yazar','Neuromancer romanının yazarı kimdir?','Who wrote Neuromancer?','William Gibson',['Neal Stephenson','Orson Scott Card','Kurt Vonnegut']],
['star-trek-yaratici','Star Trek evreninin yaratıcısı kimdir?','Who created Star Trek?','Gene Roddenberry',['George Lucas','J. J. Abrams','Ridley Scott']],
['doctor-who-gezegen','Doctor Who’da Doktor’un ana gezegeninin adı nedir?','What is the Doctor’s home planet in Doctor Who?','Gallifrey',['Krypton','Vulcan','Arrakis']],
['blade-runner-yazar','Blade Runner’ın uyarlandığı romanı yazan kişi kimdir?','Who wrote the novel adapted as Blade Runner?','Philip K. Dick',['Frank Herbert','Stanislaw Lem','H. G. Wells']],
['war-worlds-yazar','Dünyalar Savaşı romanının yazarı kimdir?','Who wrote The War of the Worlds?','H. G. Wells',['Jules Verne','Mary Shelley','Ray Bradbury']]
];
const d=['kolay','orta','zor'];
const out=[...base,...extra.map((x,i)=>({id:'bilim-kurgu-'+x[0],category:'Bilim Kurgu',text:x[1],choices:[x[3],...x[4]],correctIndex:0,difficulty:d[i%3],textEn:x[2],choicesEn:[x[3],...x[4]]}))];
if(out.length!==40||new Set(out.map(x=>x.id)).size!==40)throw new Error('Bilim Kurgu seti invalid');
fs.writeFileSync('new-classic-bilim-kurgu.json',JSON.stringify(out,null,2)+'\n');
fs.writeFileSync('new-classic-bilim.json',JSON.stringify(scienceOnly,null,2)+'\n');
console.log(out.length);
