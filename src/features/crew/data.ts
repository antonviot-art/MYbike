import ride from '@/assets/crew-ride.asset.json';
import red from '@/assets/red-bike.asset.json';
import orange from '@/assets/orange-bike.asset.json';
import quad from '@/assets/quad.asset.json';
export const images: Record<string,string> = { ride: ride.url, red: red.url, orange: orange.url, quad: quad.url };
export type Message = { name: string; text: string; time: string; pilot: string; audio?: string };
export type Vehicle = { name: string; owner: string; pilot: string; cc: number; type: string; image: string; hours: number; km: number; maintenance: string[]; alert: string };
export type CrewRecord = { id: string; kind: string; author_id?: string | null; payload: Record<string,unknown> };
export const demoRecords: CrewRecord[] = [
...[
{ name: 'Maxime', text: 'Qui est chaud pour une sortie dimanche dans les Vosges ? 🏍️', time: '18:32', pilot: 'M' },
{ name: 'Lucas', text: 'Carrément ! Je connais une boucle sympa au départ du lac de Gérardmer.', time: '18:34', pilot: 'L' },
{ name: 'Thomas', text: 'Le quad est prêt 💪 On se retrouve à 9h au parking du lac ?', time: '18:36', pilot: 'T' },
].map((payload,i)=>({id:`message-${i}`,kind:'message',payload})),
...[
{ name:'Beta RR 300',owner:'Maxime',pilot:'M',cc:300,type:'Enduro',image:'red',hours:124.5,km:2840,maintenance:['Vidange boîte · 110 h','Filtre à air · 122 h'],alert:'Vidange à prévoir dans 5 h'},
{ name:'KTM 350 EXC-F',owner:'Lucas',pilot:'L',cc:350,type:'Enduro',image:'orange',hours:86.2,km:1950,maintenance:['Vidange moteur · 80 h','Kit chaîne · 75 h'],alert:'Prête à rouler'},
{ name:'Yamaha Raptor 700',owner:'Thomas',pilot:'T',cc:686,type:'Quad',image:'quad',hours:162,km:3620,maintenance:['Vidange moteur · 150 h','Pneus arrière · 155 h'],alert:'Prêt à rouler'},
].map((payload,i)=>({id:`vehicle-${i}`,kind:'vehicle',payload}))];
export function validCounter(value: number) { return Number.isFinite(value) && value >= 0; }
export function readGpx(text: string): [number,number][] {
 const xml = new DOMParser().parseFromString(text,'application/xml');
 if(xml.querySelector('parsererror')) throw new Error('Le fichier GPX est illisible.');
 const points = Array.from(xml.querySelectorAll('trkpt, rtept')).map(p=>[Number(p.getAttribute('lat')),Number(p.getAttribute('lon'))] as [number,number]).filter(([lat,lng])=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180);
 if(points.length<2) throw new Error('La trace doit contenir au moins deux points.');
 return points;
}
