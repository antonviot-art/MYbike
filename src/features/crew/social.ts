import { supabase } from '@/integrations/supabase/client';

export type SharedRoom = { id: string; label: string; code: string };
export type Friend = { user_id: string; display_name: string; status: 'incoming' | 'outgoing' | 'accepted' };

type Functions = {
  mybike_rooms_list: { params: Record<string, never>; result: SharedRoom[] };
  mybike_room_create: { params: { room_label: string }; result: string };
  mybike_room_join: { params: { room_code: string }; result: string };
  mybike_friends_list: { params: Record<string, never>; result: Friend[] };
  mybike_friend_request: { params: { friend_id: string }; result: null };
  mybike_friend_accept: { params: { friend_id: string }; result: null };
};

export async function socialCall<Key extends keyof Functions>(name: Key, args: Functions[Key]['params']): Promise<Functions[Key]['result']> {
  // The independent project's additional functions are installed by mybike-social-setup.sql.
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.code === 'PGRST202' ? 'La configuration des groupes et des amis manque dans Supabase.' : error.message);
  return data as Functions[Key]['result'];
}
