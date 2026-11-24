import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { demoRecords, type CrewRecord } from './data';
import { toast } from 'sonner';
import { useLiveLocation } from './live-location';
type Crew = { favoriteRides: string[]; toggleRideFavorite: (rideId: string) => void; records:CrewRecord[]; user:User|null; name:string; firstName:string; aerial:boolean; setAerial:(enabled:boolean)=>void; sharing:boolean; setSharing:(enabled:boolean)=>void; positionClock:number; add:(kind:string,payload:Record<string,unknown>)=>Promise<void>; update:(id:string,payload:Record<string,unknown>)=>Promise<void>; remove:(id:string)=>Promise<void>; upload:(file:Blob,extension:string,folder?:string)=>Promise<string>; refresh:()=>Promise<void>; loading:boolean };
const emptyRecords: CrewRecord[] = [];
const CrewContext=createContext<Crew|null>(null);
export function CrewProvider({children}:{children:ReactNode}) {
 const [user,setUser]=useState<User|null>(null); const [demo,setDemo]=useState(demoRecords); const [cloud,setCloud]=useState<{userId:string;items:CrewRecord[]}>(); const [name,setName]=useState('Vous'); const [loading,setLoading]=useState(false);
 const givenName = user?.user_metadata['given_name'];
 const firstName = typeof givenName === 'string' ? givenName.trim() : '';
 useEffect(()=>{ let active=true; supabase.auth.getUser().then(({data})=>{if(active)setUser(data.user)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{ if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setUser(session?.user??null); }); return ()=>{active=false;subscription.unsubscribe()}; },[]);
 const [aerial, setAerialState] = useState(false);
 useEffect(() => {
   try { setAerialState(localStorage.getItem('mybike:map-style') === 'aerial'); } catch { /* Keep the default map. */ }
 }, []);
 function setAerial(enabled: boolean) {
   setAerialState(enabled);
   try { localStorage.setItem('mybike:map-style', enabled ? 'aerial' : 'streets'); } catch { /* Current setting still applies. */ }
 }
 const userId = user?.id;
 const favoriteKey = 'mybike:favorite-rides:' + (userId ?? 'demo');
 const [favorites, setFavorites] = useState<{ key: string; ids: string[] }>();
 const favoriteRides = favorites?.key === favoriteKey ? favorites.ids : [];
 useEffect(() => {
   let ids: string[] = [];
   try {
     const saved: unknown = JSON.parse(localStorage.getItem(favoriteKey) ?? '[]');
     if (Array.isArray(saved)) ids = saved.filter((id): id is string => typeof id === 'string');
   } catch { /* Keep an empty list if local storage is unavailable. */ }
   setFavorites({ key: favoriteKey, ids });
 }, [favoriteKey]);
 function toggleRideFavorite(rideId: string) {
   const ids = favoriteRides.includes(rideId) ? favoriteRides.filter(id => id !== rideId) : [rideId, ...favoriteRides];
   setFavorites({ key: favoriteKey, ids });
   try { localStorage.setItem(favoriteKey, JSON.stringify(ids)); } catch { /* Keep the session list. */ }
 }
 const displayName = firstName || (userId ? name : 'Vous');
 const [sharePreference, setSharePreference] = useState<{ userId: string; enabled: boolean }>();
 const sharing = Boolean(userId && sharePreference?.userId === userId && sharePreference.enabled);
 const setSharing = useCallback((enabled: boolean) => {
   if (!userId) return;
   setSharePreference({ userId, enabled });
   try { localStorage.setItem('mybike:share-location:' + userId, String(enabled)); } catch { /* Current-session preference still applies. */ }
 }, [userId]);
 const stopSharing = useCallback(() => setSharing(false), [setSharing]);
 useEffect(() => {
   if (!userId) return;
   try {
     setSharePreference({ userId, enabled: localStorage.getItem('mybike:share-location:' + userId) === 'true' });
   } catch { /* Sharing stays off. */ }
 }, [userId]);
 const positionClock = useLiveLocation(userId, displayName, sharing, stopSharing);
 const privateKey = 'mybike:private-rides:' + (userId ?? 'demo');
 const [privateRoutes, setPrivateRoutes] = useState<{ key: string; items: CrewRecord[] }>();
 const localRoutes = privateRoutes?.key === privateKey ? privateRoutes.items : emptyRecords;
 useEffect(() => {
   try {
     const items: unknown = JSON.parse(localStorage.getItem(privateKey) ?? '[]');
     setPrivateRoutes({ key: privateKey, items: Array.isArray(items) ? items : [] });
   } catch { setPrivateRoutes({ key: privateKey, items: [] }); }
 }, [privateKey]);
 function savePrivateRoutes(items: CrewRecord[]) {
   localStorage.setItem(privateKey, JSON.stringify(items));
   setPrivateRoutes({ key: privateKey, items });
 }
 const communityRecords = userId ? (cloud?.userId === userId ? cloud.items : emptyRecords) : demo;
 const records = useMemo(() => [...communityRecords, ...localRoutes], [communityRecords, localRoutes]);
 const refresh = useCallback(async () => {
   if (!userId) return;
   const { data, error } = await supabase.from('group_records').select('id,kind,payload,author_id').order('created_at').order('id');
   if (error) throw error;
   setCloud({ userId, items: (data ?? []) as CrewRecord[] });
 }, [userId]);
 useEffect(() => {
   if (!userId) return;
   let active = true;
   setLoading(true);
   const sync = () => void refresh().catch(error => { if (active) toast.error(error.message); })
     .finally(() => { if (active) setLoading(false); });
   sync();
   supabase.from('profiles').select('display_name').eq('id', userId).single()
     .then(({ data }) => { if (active) setName(data?.display_name ?? 'Pilote'); });
   const channel = supabase.channel('crew-' + crypto.randomUUID())
     .on('postgres_changes', { event: '*', schema: 'public', table: 'group_records' }, sync).subscribe();
   return () => { active = false; void supabase.removeChannel(channel); };
 }, [userId, refresh]);

 function changeRecords(change: (items: CrewRecord[]) => CrewRecord[]) {
   if (!userId) setDemo(change);
   else setCloud(previous => previous?.userId === userId
     ? { userId, items: change(previous.items) }
     : previous);
 }

 async function add(kind: string, payload: Record<string, unknown>) {
   if (kind === 'ride-track' && payload['visibility'] === 'private') {
     savePrivateRoutes([...localRoutes, { id: crypto.randomUUID(), kind, payload, ...(userId ? { author_id: userId } : {}) }]);
     return;
   }
   if (!userId) {
     changeRecords(items => [...items, { id: crypto.randomUUID(), kind, payload }]);
     return;
   }
   const { data, error } = await supabase.from('group_records')
     .insert({ kind, payload: JSON.parse(JSON.stringify(payload)), author_id: userId }).select().single();
   if (error) throw error;
   if (data) changeRecords(items => items.some(item => item.id === data.id) ? items : [...items, data as CrewRecord]);
 }

 async function update(id: string, payload: Record<string, unknown>) {
   if (localRoutes.some(item => item.id === id)) {
     savePrivateRoutes(localRoutes.map(item => item.id === id ? { ...item, payload } : item));
     return;
   }
   if (userId) {
     const { error } = await supabase.from('group_records').update({ payload: JSON.parse(JSON.stringify(payload)) }).eq('id', id).select('id').single();
     if (error) throw error;
   }
   changeRecords(items => items.map(item => item.id === id ? { ...item, payload } : item));
 }
 async function remove(id: string) {
   if (localRoutes.some(item => item.id === id)) {
     savePrivateRoutes(localRoutes.filter(item => item.id !== id));
     return;
   }
   if (userId) {
     const { error } = await supabase.from('group_records').delete().eq('id', id).eq('author_id', userId).select('id').single();
     if (error) throw error;
   }
   changeRecords(items => items.filter(item => item.id !== id));
 }
  async function upload(file:Blob,extension:string,folder?:string){if(!user)return URL.createObjectURL(file);const path=`${user.id}/${folder ? folder + '/' : ''}${crypto.randomUUID()}.${extension}`;const {error}=await supabase.storage.from('group-media').upload(path,file);if(error)throw error;return path;}
 return <CrewContext.Provider value={{favoriteRides,toggleRideFavorite,records,user,name:displayName,firstName,aerial,setAerial,sharing,setSharing,positionClock,add,update,remove,upload,refresh,loading:!!userId && loading}}>{children}</CrewContext.Provider>;
}
export function useCrew(){const value=useContext(CrewContext);if(!value)throw new Error('CrewProvider required');return value;}
export async function resolveMedia(path:string){ if(path.startsWith('blob:')||path.startsWith('https:'))return path;const {data,error}=await supabase.storage.from('group-media').createSignedUrl(path,300);if(error)throw error;return data.signedUrl; }
